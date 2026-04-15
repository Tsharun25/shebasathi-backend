require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

app.use(cors());

// ================= DB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(() => console.log("Mongo Error ❌"));

// ================= SCHEMAS =================
const User = mongoose.model("User", {
  name: String,
  phone: String,
  email: String,
  password: String,
  role: { type: String, default: "user" },
});

const Doctor = mongoose.model("Doctor", {
  name: String,
  department: String,
  hospital: String,
  fee: Number,
  days: [String], // ["Sun","Mon"]
  time: String,
});

const Booking = mongoose.model("Booking", {
  user: String,
  doctor: String,
  date: String,
  time: String,
});

// ================= AUTH =================

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    if (!password) return res.json({ message: "Password required" });
    if (!phone && !email)
      return res.json({ message: "Phone or Email required" });

    const exist = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (exist) return res.json({ message: "User already exists" });

    const hash = await bcrypt.hash(password, 10);

    await new User({
      name,
      phone,
      email,
      password: hash,
    }).save();

    res.json({ message: "Register success ✅" });
  } catch {
    res.json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ phone: identifier }, { email: identifier }],
    });

    if (!user) return res.json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);

    if (!match) return res.json({ message: "Password wrong" });

    res.json({
      user: {
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    });
  } catch {
    res.json({ message: "Server error" });
  }
});

// ================= DOCTOR =================
app.get("/api/doctors", async (req, res) => {
  res.json(await Doctor.find());
});

// ================= BOOKING =================

// 🔥 BOOK
app.post("/api/book", async (req, res) => {
  try {
    const { doctor, date, time, user } = req.body;

    if (!user) return res.json({ message: "Login required" });

    const doc = await Doctor.findOne({ name: doctor });

    const day = new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
    });

    // ❌ doctor available না হলে block
    if (!doc.days.includes(day)) {
      return res.json({ message: "এই দিনে ডাক্তার বসেন না" });
    }

    const exist = await Booking.findOne({ doctor, date, time });

    if (exist) {
      return res.json({ message: "এই সময় আগে থেকেই বুকড" });
    }

    await new Booking({ doctor, date, time, user }).save();

    res.json({ message: "Booking success ✅" });
  } catch {
    res.json({ message: "Server error" });
  }
});

// 🔥 USER BOOKINGS
app.get("/api/my-bookings/:user", async (req, res) => {
  const data = await Booking.find({ user: req.params.user });
  res.json(data);
});

// ================= TRANSPORT =================

app.get("/api/transport", async (req, res) => {
  res.json(await Transport.find());
});

app.post("/api/transport-book", async (req, res) => {
  await new Transport(req.body).save();
  res.json({ message: "Transport booked 🚗" });
});

// ================= SERVER =================
app.listen(5000, () => console.log("Server running 🚀"));