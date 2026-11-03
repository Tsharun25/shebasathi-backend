import { createHash, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";

export const hashResetToken = (token) => createHash("sha256").update(token).digest("hex");

export function emailSettings() {
  const { SMTP_HOST: host, SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: from, FRONTEND_URL: frontend } = process.env;
  const port = Number(process.env.SMTP_PORT || 587);
  let url;
  try { url = new URL(frontend); } catch { /* checked below */ }
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port < 1 || port > 65535 || !url || url.username || url.password ||
      (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) {
    const error = new Error("ইমেইল রিসেট সেবা এখনো চালু হয়নি। পরে চেষ্টা করুন।");
    error.status = 503; throw error;
  }
  return { host, port, user, pass, from, origin: url.origin };
}

export async function sendResetEmail({ email, token }) {
  const settings = emailSettings();
  const transport = nodemailer.createTransport({ host: settings.host, port: settings.port,
    secure: settings.port === 465, requireTLS: settings.port !== 465,
    auth: { user: settings.user, pass: settings.pass },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    disableFileAccess: true, disableUrlAccess: true,
  });
  // A fragment keeps the secret out of page requests and Referer headers.
  const link = `${settings.origin}/reset-password#token=${token}`;
  await transport.sendMail({ from: settings.from, to: { address: email },
    subject: "ShebaSathi — পাসওয়ার্ড রিসেট",
    text: `আপনার পাসওয়ার্ড বদলাতে এই লিংক খুলুন:\n${link}\n\nলিংকটি ১৫ মিনিটের মধ্যে একবার ব্যবহার করা যাবে। আপনি অনুরোধ না করলে এই ইমেইল উপেক্ষা করুন।`,
  });
}

export function installEmailReset({ app, User, limit, route, mailer = sendResetEmail }) {
  app.post("/api/forgot-password/email", route(async (req, res) => {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: "সঠিক ইমেইল ঠিকানা দিন।" });
    await limit(`email-ip:${req.ip}`, 20, 3600);
    await limit(`email-address:${hashResetToken(email)}`, 5, 3600);
    await limit(`email-cooldown:${hashResetToken(email)}`, 1, 60);
    if (mailer === sendResetEmail) emailSettings();
    const token = randomBytes(32).toString("hex");
    const tokenHash = hashResetToken(token);
    const user = await User.findOneAndUpdate({ email }, { $set: {
      emailResetHash: tokenHash, emailResetExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
    } }, { new: true });
    if (user) {
      try { await mailer({ email, token }); }
      catch {
        await User.findOneAndUpdate({ _id: user._id, emailResetHash: tokenHash }, { $unset: { emailResetHash: 1, emailResetExpiresAt: 1 } });
        // Keep the same response for unknown accounts and delivery failures.
        console.error("Password reset email delivery failed");
      }
    }
    res.json({ retryAfter: 60, message: "এই ইমেইলে অ্যাকাউন্ট থাকলে রিসেট লিংক পাঠানোর অনুরোধ করা হয়েছে। ইনবক্স ও স্প্যাম ফোল্ডার দেখুন। লিংকের মেয়াদ ১৫ মিনিট।" });
  }));

  app.post("/api/reset-password/email", route(async (req, res) => {
    await limit(`email-reset-ip:${req.ip}`, 40, 3600);
    const { token, password } = req.body;
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ message: "রিসেট লিংক ভুল বা মেয়াদ শেষ। নতুন লিংক নিন।" });
    if (typeof password !== "string" || password.length < 8 || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ message: "পাসওয়ার্ড কমপক্ষে ৮ অক্ষর এবং সর্বোচ্চ ৭২ বাইট হতে হবে।" });
    const query = { emailResetHash: hashResetToken(token), emailResetExpiresAt: { $gt: new Date() } };
    if (!await User.findOne(query)) return res.status(400).json({ message: "রিসেট লিংক ভুল বা মেয়াদ শেষ। নতুন লিংক নিন।" });
    // Consume and change password atomically; concurrent replays lose.
    const user = await User.findOneAndUpdate(query, {
      $set: { password: await bcrypt.hash(password, 12) }, $inc: { authVersion: 1 },
      $unset: { emailResetHash: 1, emailResetExpiresAt: 1 },
    }, { new: true });
    if (!user) return res.status(400).json({ message: "লিংকটি ইতিমধ্যে ব্যবহার করা হয়েছে। নতুন লিংক নিন।" });
    res.json({ message: "পাসওয়ার্ড বদলানো হয়েছে। নতুন পাসওয়ার্ড দিয়ে লগইন করুন।" });
  }));
}
