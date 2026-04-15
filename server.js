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
  })
);

// ================= DB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch(() => console.log("Mongo Error ❌"));

// ================= SCHEMA =================

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
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    const user = await User.findOne({
      $or: [{ phone }, { email }],
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
    res.status(500).json({ message: "Server error" });
  }
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
  try {
    const { doctor, date, time, user } = req.body;

    const doc = await Doctor.findOne({ name: doctor });

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

    await new Booking({ doctor, date, time, user }).save();

    res.json({ message: "Booking success ✅" });
  } catch {
    res.status(500).json({ message: "Booking error" });
  }
});

// ================= MY BOOKINGS =================

app.get("/api/my-bookings/:user", async (req, res) => {
  try {
    const data = await Booking.find({
      user: req.params.user,
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Error fetching bookings" });
  }
});


// ================= TRANSPORT =================

// GET all transport
app.get("/api/transport", async (req, res) => {
  try {
    const data = await Transport.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Transport error" });
  }
});

// ADD transport booking (optional)
app.post("/api/transport-book", async (req, res) => {
  try {
    await new Transport(req.body).save();
    res.json({ message: "Transport booked 🚗" });
  } catch (err) {
    res.status(500).json({ message: "Transport booking error" });
  }
});

// ================= HOTEL =================

app.get("/api/hotel", async (req, res) => {
  try {
    const data = await Hotel.find();
    res.json(data);
  } catch (err) {
    res.status(500).json({ message: "Hotel error" });
  }
});

app.post("/api/hotel-book", async (req, res) => {
  try {
    await new Hotel(req.body).save();
    res.json({ message: "Hotel booked 🏨" });
  } catch (err) {
    res.status(500).json({ message: "Hotel booking error" });
  }
});

// ================= SERVER =================

app.listen(5000, () => console.log("Server running 🚀"));