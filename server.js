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
  days: [String],
  time: String,
});

const Booking = mongoose.model("Booking", {
  user: String,
  doctor: String,
  date: String,
  time: String,
});

const Transport = mongoose.model("Transport", {
  name: String,
  location: String,
  phone: String,
});

const Hotel = mongoose.model("Hotel", {
  name: String,
  location: String,
  price: Number,
});

// ================= AUTH =================

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  const { name, phone, email, password } = req.body;

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
});

// LOGIN (phone/email)
app.post("/api/auth/login", async (req, res) => {
  const { phone, email, password } = req.body;

  const user = await User.findOne({
    $or: [{ phone }, { email }],
  });

  if (!user) return res.json({ message: "User not found" });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.json({ message: "Wrong password" });

  res.json({
    user: {
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  });
});

// ================= DOCTOR =================

app.get("/api/doctors", async (req, res) => {
  res.json(await Doctor.find());
});

app.post("/api/admin/add-doctor", async (req, res) => {
  await new Doctor(req.body).save();
  res.json({ message: "Doctor added ✅" });
});

app.delete("/api/admin/delete-doctor/:id", async (req, res) => {
  await Doctor.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted ❌" });
});

// ================= BOOKING =================

app.post("/api/book", async (req, res) => {
  await new Booking(req.body).save();
  res.json({ message: "Booked ✅" });
});

app.get("/api/my-bookings/:user", async (req, res) => {
  res.json(await Booking.find({ user: req.params.user }));
});

// ================= TRANSPORT =================

app.get("/api/transport", async (req, res) => {
  res.json(await Transport.find());
});

app.post("/api/transport-book", async (req, res) => {
  await new Transport(req.body).save();
  res.json({ message: "Transport booked 🚑" });
});

// ================= HOTEL =================

app.get("/api/hotel", async (req, res) => {
  res.json(await Hotel.find());
});

app.post("/api/hotel-book", async (req, res) => {
  await new Hotel(req.body).save();
  res.json({ message: "Hotel booked 🏨" });
});

// ================= ADMIN STATS =================

app.get("/api/admin/stats", async (req, res) => {
  const users = await User.countDocuments();
  const doctors = await Doctor.countDocuments();
  const bookings = await Booking.countDocuments();

  res.json({ users, doctors, bookings });
});

// ================= SERVER =================
app.listen(5000, () => console.log("Server running 🚀"));