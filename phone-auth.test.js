import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import bcrypt from "bcryptjs";
import { canonicalPhone, installPhoneAuth, verifyRequest } from "./phone-auth.js";
import { hashResetToken, emailSettings } from "./email-reset.js";

// In-memory persistence substitute; no production database or SMS is contacted.
function model() {
  const rows = new Map();
  const matches = (row, query) => Object.entries(query).every(([key, value]) => {
    if (value?.$in) return value.$in.includes(row[key]);
    if (value?.$gt) return row[key] > value.$gt;
    if (value?.$lt !== undefined) return (row[key] || 0) < value.$lt;
    return row[key] === value;
  });
  return {
    rows,
    async create(row) { rows.set(row._id, { attempts: 0, ...row }); },
    async findOne(query) { return [...rows.values()].find((row) => matches(row, query)); },
    async findOneAndUpdate(query, update, options = {}) {
      let row = await this.findOne(query);
      if (!row && options.upsert) {
        row = { ...query, _id: query._id || String(rows.size + 1), ...update.$setOnInsert };
        rows.set(row._id, row);
      }
      if (!row) return null;
      Object.assign(row, update.$set);
      for (const key of Object.keys(update.$unset || {})) delete row[key];
      for (const [key, value] of Object.entries(update.$inc || {})) row[key] = (row[key] || 0) + value;
      return { ...row };
    },
    async findOneAndDelete(query) {
      const row = await this.findOne(query);
      if (row) rows.delete(row._id);
      return row;
    },
  };
}

async function fixture(t, options = {}) {
  const app = express(); app.use(express.json());
  class Schema { index() {} }
  const mongoose = { Schema, models: {}, model(name) { return this.models[name] = model(); } };
  const User = model();
  const sent = [];
  const emails = [];
  installPhoneAuth({ app, mongoose, User, makeToken: (user) => `token:${user._id}:${user.authVersion || 0}`,
    mailer: options.mailer || (async (message) => { emails.push(message); }),
    provider: async (path, fields) => {
      if (path === "Verifications") { sent.push(fields); return { sid: `VE${sent.length}` }; }
      return { status: fields.Code === "123456" ? "approved" : "pending" };
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const post = async (path, body) => {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/${path}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: response.status, ...await response.json() };
  };
  return { post, User, sent, mongoose, emails };
}

test("Bangladesh phone formats normalize, invalid inputs are rejected", () => {
  for (const phone of ["01710071135", "+8801710071135", "8801710071135"]) assert.equal(canonicalPhone(phone), "01710071135");
  for (const phone of [null, {}, "01210071135", "0171007113", "+15555555555"]) assert.equal(canonicalPhone(phone), null);
});
test("new OTP login creates a user once, rejects replay and invalid codes", async (t) => {
  const { post, User } = await fixture(t);
  const challenge = await post("send-otp", { phone: "01710071135" });
  assert.equal(challenge.status, 200);
  assert.equal((await post("verify-otp", { challengeId: challenge.challengeId, otp: "000000" })).status, 400);
  const result = await post("verify-otp", { challengeId: challenge.challengeId, otp: "123456" });
  assert.equal(result.user.role, "user"); assert.ok(result.token); assert.equal(User.rows.size, 1);
  assert.equal((await post("verify-otp", { challengeId: challenge.challengeId, otp: "123456" })).status, 400);
});
test("admin reset requires reset challenge and preserves role while revoking sessions", async (t) => {
  const { post, User } = await fixture(t);
  await User.create({ _id: "admin", phone: "01710071135", role: "admin", password: "old" });
  const challenge = await post("send-otp", { phone: "+8801710071135", purpose: "reset" });
  assert.equal((await post("verify-otp", { challengeId: challenge.challengeId, otp: "123456" })).status, 400);
  assert.equal((await post("reset-password", { challengeId: challenge.challengeId, otp: "123456", password: "new-password" })).status, 200);
  const user = User.rows.get("admin");
  assert.equal(user.role, "admin"); assert.equal(user.authVersion, 1);
  assert.ok(await bcrypt.compare("new-password", user.password));
  assert.equal((await post("reset-password", { challengeId: challenge.challengeId, otp: "123456", password: "other-password" })).status, 400);
});
test("existing admin OTP login keeps original account and role", async (t) => {
  const { post, User } = await fixture(t);
  await User.create({ _id: "admin", phone: "+8801710071135", role: "admin" });
  const { challengeId } = await post("send-otp", { phone: "01710071135" });
  const result = await post("verify-otp", { challengeId, otp: "123456" });
  assert.equal(result.user._id, "admin"); assert.equal(result.user.role, "admin"); assert.equal(User.rows.size, 1);
});
test("expired OTP, five failed guesses and rapid resends are rejected", async (t) => {
  const { post, mongoose } = await fixture(t);
  const { challengeId } = await post("send-otp", { phone: "01710071135" });
  assert.equal((await post("send-otp", { phone: "01710071135" })).status, 429);
  for (let i = 0; i < 5; i++) await post("verify-otp", { challengeId, otp: "000000" });
  assert.equal((await post("verify-otp", { challengeId, otp: "123456" })).status, 400);
  const other = await post("send-otp", { phone: "01810071135" });
  mongoose.models.PhoneChallenge.rows.get(other.challengeId).expiresAt = new Date(0);
  assert.equal((await post("verify-otp", { challengeId: other.challengeId, otp: "123456" })).status, 400);
});
test("unknown reset never creates an account or sends an SMS", async (t) => {
  const { post, User, sent } = await fixture(t);
  const challenge = await post("send-otp", { phone: "01710071135", purpose: "reset" });
  assert.equal(challenge.status, 200); assert.equal(sent.length, 0);
  assert.equal((await post("reset-password", { challengeId: challenge.challengeId, otp: "123456", password: "new-password" })).status, 400);
  assert.equal(User.rows.size, 0);
});
test("provider fails closed without credentials", async () => {
  await assert.rejects(verifyRequest("Verifications", {}), (error) => error.status === 503);
});

test("email-only admin can reset with a hashed, single-use token", async (t) => {
  const { post, User, emails } = await fixture(t);
  await User.create({ _id: "admin", email: "admin@example.com", role: "admin", password: "old" });
  assert.equal((await post("forgot-password/email", { email: " Admin@example.com " })).status, 200);
  assert.equal(emails.length, 1);
  const token = emails[0].token;
  assert.match(token, /^[a-f0-9]{64}$/);
  assert.equal(User.rows.get("admin").emailResetHash, hashResetToken(token));
  assert.ok(!JSON.stringify([...User.rows.values()]).includes(token));
  assert.equal((await post("reset-password/email", { token, password: "short" })).status, 400);
  assert.equal((await post("reset-password/email", { token, password: "new-password" })).status, 200);
  const user = User.rows.get("admin");
  assert.equal(user.role, "admin"); assert.equal(user.authVersion, 1);
  assert.equal(user.emailResetHash, undefined);
  assert.ok(await bcrypt.compare("new-password", user.password));
  assert.equal((await post("reset-password/email", { token, password: "another-password" })).status, 400);
});
test("email reset rejects invalid, expired and superseded links", async (t) => {
  const { post, User, emails, mongoose } = await fixture(t);
  await User.create({ _id: "user", email: "user@example.com", password: "old" });
  await post("forgot-password/email", { email: "user@example.com" });
  const old = emails[0].token;
  assert.equal((await post("forgot-password/email", { email: "user@example.com" })).status, 429);
  mongoose.models.PhoneAuthLimit.rows.clear();
  await post("forgot-password/email", { email: "user@example.com" });
  assert.equal((await post("reset-password/email", { token: old, password: "new-password" })).status, 400);
  assert.equal((await post("reset-password/email", { token: "0".repeat(64), password: "new-password" })).status, 400);
  User.rows.get("user").emailResetExpiresAt = new Date(0);
  assert.equal((await post("reset-password/email", { token: emails[1].token, password: "new-password" })).status, 400);
  assert.equal(User.rows.get("user").password, "old");
});
test("unknown email has the same public response and sends nothing", async (t) => {
  const { post, User, emails } = await fixture(t);
  await User.create({ _id: "user", email: "user@example.com" });
  const known = await post("forgot-password/email", { email: "user@example.com" });
  const unknown = await post("forgot-password/email", { email: "unknown@example.com" });
  assert.deepEqual(unknown, known); assert.equal(emails.length, 1); assert.equal(User.rows.size, 1);
  assert.equal((await post("forgot-password/email", { email: { $ne: null } })).status, 400);
});
test("SMS reset also invalidates an outstanding email reset link", async (t) => {
  const { post, User, emails } = await fixture(t);
  await User.create({ _id: "user", email: "user@example.com", phone: "01710071135", password: "old" });
  await post("forgot-password/email", { email: "user@example.com" });
  const { challengeId } = await post("send-otp", { phone: "01710071135", purpose: "reset" });
  assert.equal((await post("reset-password", { challengeId, otp: "123456", password: "new-password" })).status, 200);
  assert.equal((await post("reset-password/email", { token: emails[0].token, password: "other-password" })).status, 400);
});
test("email service fails closed without SMTP configuration", () => {
  assert.throws(() => emailSettings(), (error) => error.status === 503);
});
