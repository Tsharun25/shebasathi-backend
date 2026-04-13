require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json());

const allowedOrigins = [
  "http://localhost:3000",
  "https://shebasathi-next.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// ================= MONGODB CONNECT =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("MongoDB Error ❌", err));

// ================= SCHEMAS =================

// USER
const User = mongoose.model("User", {
  name: String,
  email: String,
  phone: String,
  password: String,
});

// DOCTOR
const Doctor = mongoose.model("Doctor", {
  name: String,
  department: String,
  hospital: String,
  fee: Number,
});

// BOOKING
const Booking = mongoose.model("Booking", {
  userEmail: String,
  doctorId: String,
  doctorName: String,
  date: String,
  time: String,
});

// ================= BASIC =================

app.get("/", (req, res) => {
  res.send("Backend running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({ success: true });
});

// ================= AUTH =================

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!phone && !email) {
      return res
        .status(400)
        .json({ message: "মোবাইল অথবা ইমেইল দিন" });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        message: "এই ইউজার আগে থেকেই আছে",
      });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      phone,
      password: hashed,
    });

    await user.save();

    res.json({ message: "রেজিস্টার সফল ✅" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN (phone/email)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;

    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (!user) {
      return res.status(400).json({ message: "User not found" });
    }

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ message: "Wrong password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= DOCTORS =================

// GET ALL DOCTORS (DB থেকে আসবে ✅)
app.get("/api/doctors", async (req, res) => {
  try {
    const doctors = await Doctor.find();
    res.json(doctors);
  } catch {
    res.status(500).json({ message: "Error fetching doctors" });
  }
});

// SEED (only run once)
app.get("/seed", async (req, res) => {
  try {
    await Doctor.deleteMany();

    await Doctor.insertMany([
      {
        name: "ডা. রহমান",
        department: "কার্ডিওলজি",
        hospital: "ঢাকা মেডিকেল",
        fee: 500,
      },
      {
        name: "ডা. করিম",
        department: "নিউরোলজি",
        hospital: "স্কয়ার হাসপাতাল",
        fee: 800,
      },
    ]);

    res.send("Doctor DB Seeded ✅");
  } catch {
    res.status(500).send("Seed error");
  }
});

// ================= BOOKINGS =================

// CREATE BOOKING
app.post("/api/book", async (req, res) => {
  try {
    const { userEmail, doctorId, doctorName, date, time } =
      req.body;

    // ❗ prevent duplicate slot booking
    const exists = await Booking.findOne({
      doctorId,
      date,
      time,
    });

    if (exists) {
      return res.json({
        message: "এই সময় ইতিমধ্যে বুকড ❌",
      });
    }

    const booking = new Booking({
      userEmail,
      doctorId,
      doctorName,
      date,
      time,
    });

    await booking.save();

    res.json({ message: "বুকিং সফল ✅" });
  } catch {
    res.status(500).json({ message: "Booking error" });
  }
});

// GET USER BOOKINGS
app.get("/api/my-bookings/:email", async (req, res) => {
  const bookings = await Booking.find({
    userEmail: req.params.email,
  });

  res.json(bookings);
});

// ================= SERVER =================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT} 🚀`);
});