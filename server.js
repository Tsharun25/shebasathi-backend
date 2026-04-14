require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

// ================= CORS =================
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
  }),
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
  role: {
    type: String,
    default: "user",
  },
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
  try {
    const { name, phone, email, password } = req.body;

    if (!password) {
      return res.json({ message: "Password required" });
    }

    if (!phone && !email) {
      return res.json({ message: "Phone or Email required" });
    }

    const exist = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (exist) {
      return res.json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await new User({
      name,
      phone,
      email,
      password: hashedPassword,
    }).save();

    res.json({ message: "Register success ✅" });
  } catch (err) {
    res.json({ message: "Server error" });
  }
});

// LOGIN ✅ FIXED
app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    const user = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (!user) {
      return res.json({ message: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.json({ message: "Password wrong" });
    }

    res.json({
      user: {
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    res.json({ message: "Server error" });
  }
});

// ================= DOCTOR =================

app.get("/api/doctors", async (req, res) => {
  const data = await Doctor.find();
  res.json(data);
});

app.post("/api/admin/add-doctor", async (req, res) => {
  await new Doctor(req.body).save();
  res.json({ message: "Doctor added ✅" });
});

app.delete("/api/admin/delete-doctor/:id", async (req, res) => {
  await Doctor.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted ❌" });
});

//================Booking=======================

app.post("/api/book", async (req, res) => {
  try {
    const { doctor, date, time, user } = req.body;

    const doc = await Doctor.findOne({ name: doctor });

    if (!doc) {
      return res.json({ message: "Doctor not found" });
    }

    const day = new Date(date).toLocaleDateString("en-US", {
      weekday: "short",
    });

    if (!doc.days.includes(day)) {
      return res.json({ message: "এই দিনে ডাক্তার বসেন না" });
    }

    const exist = await Booking.findOne({ doctor, date, time });

    if (exist) {
      return res.json({ message: "এই সময় আগে থেকেই বুকড" });
    }

    await new Booking({
      doctor,
      date,
      time,
      user, // 🔥 IMPORTANT
    }).save();

    res.json({ message: "Booking success ✅" });
  } catch (err) {
    res.json({ message: "Booking error" });
  }
});

// ================= HOTEL =================

app.get("/api/hotel", async (req, res) => {
  const data = await Hotel.find();
  res.json(data);
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

//===============my Bookings=============

app.get("/api/my-bookings/:user", async (req, res) => {
  const data = await Booking.find({ user: req.params.user });
  res.json(data);
});

//==============Services Booking==============
const ServiceBooking = mongoose.model("ServiceBooking", {
  user: String,
  service: String,
  type: String, // transport / hotel
});

app.post("/api/transport-book", async (req, res) => {
  try {
    const { user, service } = req.body;

    await new ServiceBooking({
      user,
      service,
      type: "transport",
    }).save();

    res.json({ message: "Transport booked 🚑" });
  } catch (err) {
    res.json({ message: "Error booking transport" });
  }
});

app.post("/api/hotel-book", async (req, res) => {
  try {
    const { user, service } = req.body;

    await new ServiceBooking({
      user,
      service,
      type: "hotel",
    }).save();

    res.json({ message: "Hotel booked 🏨" });
  } catch (err) {
    res.json({ message: "Error booking hotel" });
  }
});

app.get("/api/my-bookings/:user", async (req, res) => {
  try {
    const doctorBookings = await Booking.find({
      user: req.params.user,
    });

    const serviceBookings = await ServiceBooking.find({
      user: req.params.user,
    });

    res.json({
      doctor: doctorBookings,
      service: serviceBookings,
    });
  } catch (err) {
    res.json({ message: "Error loading bookings" });
  }
});

// ================= SERVER =================
app.listen(5000, () => console.log("Server running 🚀"));
