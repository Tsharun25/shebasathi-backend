require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "https://shebasathi-next.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("CORS error"));
    },
  })
);

// DB CONNECT
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Mongo Connected ✅"))
  .catch(() => console.log("Mongo Error ❌"));

// ================= SCHEMA =================

// USER
const User = mongoose.model("User", {
  name: String,
  email: String,
  phone: String,
  password: String,
});

// DOCTOR (SMART)
const Doctor = mongoose.model("Doctor", {
  name: String,
  department: String,
  hospital: String,
  fee: Number,
  availableDays: [String],
  startTime: String,
  endTime: String,
  slotDuration: Number,
});

// BOOKING
const Booking = mongoose.model("Booking", {
  userEmail: String,
  doctorId: String,
  doctorName: String,
  date: String,
  time: String,
});

// ================= AUTH =================

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  const { name, email, phone, password } = req.body;

  if (!phone && !email) {
    return res.json({ message: "মোবাইল বা ইমেইল দিন" });
  }

  const exists = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (exists) return res.json({ message: "আগেই রেজিস্টার করা" });

  const hashed = await bcrypt.hash(password, 10);

  await new User({ name, email, phone, password: hashed }).save();

  res.json({ message: "রেজিস্টার সফল ✅" });
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  const { identifier, password } = req.body;

  const user = await User.findOne({
    $or: [{ email: identifier }, { phone: identifier }],
  });

  if (!user) return res.json({ message: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ message: "Wrong password" });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

  res.json({
    token,
    user: {
      name: user.name,
      email: user.email,
      phone: user.phone,
    },
  });
});

// ================= DOCTORS =================

// GET DOCTORS
app.get("/api/doctors", async (req, res) => {
  const doctors = await Doctor.find();
  res.json(doctors);
});

// SEED
app.get("/seed", async (req, res) => {
  await Doctor.deleteMany();

  await Doctor.insertMany([
    {
      name: "ডা. রহমান",
      department: "কার্ডিওলজি",
      hospital: "ঢাকা মেডিকেল",
      fee: 500,
      availableDays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"],
      startTime: "16:00",
      endTime: "21:00",
      slotDuration: 60,
    },
    {
      name: "ডা. করিম",
      department: "নিউরোলজি",
      hospital: "স্কয়ার হাসপাতাল",
      fee: 800,
      availableDays: ["Sunday", "Tuesday", "Thursday"],
      startTime: "17:00",
      endTime: "20:00",
      slotDuration: 60,
    },
  ]);

  res.send("Seed Done ✅");
});

// ================= BOOKING =================

// BOOK
app.post("/api/book", async (req, res) => {
  const { userEmail, doctorId, doctorName, date, time } = req.body;

  // prevent duplicate
  const exists = await Booking.findOne({ doctorId, date, time });
  if (exists) return res.json({ message: "এই সময় বুকড ❌" });

  await new Booking({ userEmail, doctorId, doctorName, date, time }).save();

  res.json({ message: "বুকিং সফল ✅" });
});

// GET USER BOOKINGS
app.get("/api/my-bookings/:email", async (req, res) => {
  const data = await Booking.find({ userEmail: req.params.email });
  res.json(data);
});

// BOOKED SLOTS
app.get("/api/booked/:doctorId/:date", async (req, res) => {
  const data = await Booking.find({
    doctorId: req.params.doctorId,
    date: req.params.date,
  });

  res.json(data.map((d) => d.time));
});

// ================= SERVER =================

app.listen(5000, () => console.log("Server running 🚀"));