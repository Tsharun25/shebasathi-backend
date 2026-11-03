import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { installEmailReset } from "./email-reset.js";

export function canonicalPhone(value) {
  if (typeof value !== "string") return null;
  let phone = value.trim().replace(/[\s()-]/g, "");
  if (phone.startsWith("+880")) phone = phone.slice(3);
  else if (phone.startsWith("880")) phone = phone.slice(2);
  return /^01[3-9]\d{8}$/.test(phone) ? phone : null;
}

export function phoneAliases(phone) {
  return [phone, `88${phone}`, `+88${phone}`];
}

export async function verifyRequest(path, fields) {
  const { TWILIO_ACCOUNT_SID: account, TWILIO_AUTH_TOKEN: secret,
    TWILIO_VERIFY_SERVICE_SID: service } = process.env;
  if (!account || !secret || !service) {
    const error = new Error("ফোন যাচাই সেবা এখনো চালু হয়নি। পরে আবার চেষ্টা করুন।");
    error.status = 503;
    throw error;
  }
  const response = await fetch(`https://verify.twilio.com/v2/Services/${encodeURIComponent(service)}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${account}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields), signal: AbortSignal.timeout(15000),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error("OTP পাঠানো বা যাচাই করা যায়নি। নতুন কোড নিয়ে আবার চেষ্টা করুন।");
    error.status = response.status === 429 ? 429 : 400;
    throw error;
  }
  return data;
}

export function installPhoneAuth({ app, mongoose, User, makeToken, provider = verifyRequest, mailer }) {
  const challengeSchema = new mongoose.Schema({
    _id: String, phone: String, purpose: String, providerSid: String,
    attempts: { type: Number, default: 0 }, expiresAt: Date,
  });
  challengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const Challenge = mongoose.models.PhoneChallenge || mongoose.model("PhoneChallenge", challengeSchema);
  const limitSchema = new mongoose.Schema({ _id: String, count: Number, expiresAt: Date });
  limitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  const Limit = mongoose.models.PhoneAuthLimit || mongoose.model("PhoneAuthLimit", limitSchema);

  async function limit(key, maximum, seconds) {
    const window = Math.floor(Date.now() / (seconds * 1000));
    const record = await Limit.findOneAndUpdate({ _id: `${key}:${window}` }, {
      $inc: { count: 1 }, $set: { expiresAt: new Date((window + 2) * seconds * 1000) },
    }, { upsert: true, new: true });
    if (record.count > maximum) {
      const error = new Error("অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।");
      error.status = 429;
      throw error;
    }
  }

  const route = (handler) => async (req, res) => {
    res.set("Cache-Control", "no-store");
    try { await handler(req, res); }
    catch (error) {
      // Never log credentials, OTPs, or provider response bodies.
      res.status(error.status || 503).json({ message: error.status ? error.message : "সেবা সাময়িকভাবে পাওয়া যাচ্ছে না। আবার চেষ্টা করুন।" });
    }
  };
  const reject = () => { const error = new Error("কোড ভুল অথবা মেয়াদ শেষ। নতুন OTP নিন।"); error.status = 400; throw error; };
  const publicUser = (user) => ({ _id: user._id, name: user.name, phone: user.phone, email: user.email, role: user.role });

  installEmailReset({ app, User, limit, route, mailer });

  app.post("/api/send-otp", route(async (req, res) => {
    const phone = canonicalPhone(req.body.phone);
    const purpose = req.body.purpose || "login";
    if (!phone || !["login", "reset"].includes(purpose)) {
      return res.status(400).json({ message: "সঠিক বাংলাদেশি মোবাইল নম্বর দিন।" });
    }
    await limit(`send-ip:${req.ip}`, 20, 3600);
    await limit(`send-phone:${phone}`, 5, 3600);
    await limit(`cooldown:${phone}`, 1, 60);
    const user = purpose === "reset" ? await User.findOne({ phone: { $in: phoneAliases(phone) } }) : null;
    // Keep the same response for unknown reset accounts to avoid account enumeration.
    const verification = purpose === "login" || user
      ? await provider("Verifications", { To: `+88${phone}`, Channel: "sms" }) : null;
    const challengeId = randomUUID();
    await Challenge.create({ _id: challengeId, phone, purpose, providerSid: verification?.sid,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
    res.json({ challengeId, retryAfter: 60, message: "নম্বরটি উপযুক্ত হলে OTP পাঠানো হয়েছে। কোড ৫ মিনিটের মধ্যে দিন।" });
  }));

  async function consume(req, purpose) {
    if (typeof req.body.challengeId !== "string" || !/^\d{6}$/.test(req.body.otp || "")) reject();
    await limit(`verify-ip:${req.ip}`, 40, 3600);
    // Increment before calling the provider, so concurrent guesses share the limit.
    const challenge = await Challenge.findOneAndUpdate({ _id: req.body.challengeId, purpose,
      expiresAt: { $gt: new Date() }, attempts: { $lt: 5 } }, { $inc: { attempts: 1 } }, { new: true });
    if (!challenge?.providerSid) reject();
    const check = await provider("VerificationCheck", { VerificationSid: challenge.providerSid, Code: req.body.otp });
    if (check.status !== "approved") reject();
    const consumed = await Challenge.findOneAndDelete({ _id: challenge._id, purpose, expiresAt: { $gt: new Date() } });
    if (!consumed) reject();
    return challenge.phone;
  }

  app.post("/api/verify-otp", route(async (req, res) => {
    const phone = await consume(req, "login");
    let user = await User.findOne({ phone: { $in: phoneAliases(phone) } });
    if (!user) {
      user = await User.findOneAndUpdate({ phone }, { $setOnInsert: { name: "নতুন ব্যবহারকারী", role: "user" } }, { new: true, upsert: true });
    }
    res.json({ token: makeToken(user), user: publicUser(user) });
  }));

  app.post("/api/reset-password", route(async (req, res) => {
    const password = req.body.password;
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
      return res.status(400).json({ message: "নতুন পাসওয়ার্ড কমপক্ষে ৮ অক্ষর এবং সর্বোচ্চ ৭২ বাইট হতে হবে।" });
    }
    const phone = await consume(req, "reset");
    const user = await User.findOneAndUpdate({ phone: { $in: phoneAliases(phone) } }, {
      $set: { password: await bcrypt.hash(password, 12) }, $inc: { authVersion: 1 },
      $unset: { emailResetHash: 1, emailResetExpiresAt: 1 },
    }, { new: true });
    if (!user) reject();
    res.json({ message: "পাসওয়ার্ড বদলানো হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।" });
  }));
}
