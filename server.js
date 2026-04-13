require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

// ================= MIDDLEWARE =================
app.use(express.json());

// ✅ CORS FIX (Production Ready)
const allowedOrigins = [
  "http://localhost:3000",
  "https://shebasathi-next.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS blocked ❌"));
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
  password: String,
});

// DOCTOR
const Doctor = mongoose.model("Doctor", {
  name: String,
  department: String,
  hospital: String,
  fee: Number,
});

// BOOKING (UPDATED ✅)
const Booking = mongoose.model("Booking", {
  userEmail: String,
  doctorId: String,
  doctorName: String,
  date: String,
  time: String,
  status: {
    type: String,
    default: "pending",
  },
});

// ================= BASIC ROUTE =================
app.get("/", (req, res) => {
  res.send("ShebaSathi Backend is running 🚀");
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Backend is healthy 🚀",
  });
});

// ================= AUTH =================

// REGISTER (mobile/email optional logic ready)
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      name,
      email,
      password: hashed,
    });

    await user.save();

    res.json({ message: "Registered successfully ✅" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      token,
      user: {
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= DOCTORS =================

// GET ALL DOCTORS
app.get("/api/doctors", async (req, res) => {
  try {
    const doctors = await Doctor.find();
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ message: "Error fetching doctors" });
  }
});

// SEED DATA
app.get("/seed", async (req, res) => {
  try {
    await Doctor.deleteMany();

    await Doctor.insertMany([
      {
        name: "ডা. মোঃ রহমান",
        department: "কার্ডিওলজি",
        hospital: "ঢাকা মেডিকেল কলেজ",
        fee: 1000,
      },
      {
        name: "ডা. নুসরাত জাহান",
        department: "নিউরোলজি",
        hospital: "এপোলো হাসপাতাল",
        fee: 800,
      },
      {
        name: "ডা. তানভীর হাসান",
        department: "মেডিসিন",
        hospital: "ল্যাবএইড",
        fee: 900,
      },
    ]);

    res.send("Doctors Added ✅");
  } catch (err) {
    res.status(500).send("Seed Error ❌");
  }
});

// ================= BOOKINGS =================

// CREATE BOOKING
app.post("/api/book", async (req, res) => {
  try {
    const { userEmail, doctorId, doctorName, date, time } = req.body;

    if (!date || !time) {
      return res.status(400).json({ message: "তারিখ ও সময় দিন" });
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
  } catch (err) {
    res.status(500).json({ message: "Booking error ❌" });
  }
});

// USER BOOKINGS
app.get("/api/my-bookings/:email", async (req, res) => {
  try {
    const bookings = await Booking.find({
      userEmail: req.params.email,
    });

    res.json(bookings);
  } catch (err) {
    res.status(500).json({ message: "Error loading bookings" });
  }
});

// ================= SERVER =================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});