import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ✅ DB CONNECT
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.log(err));

// ✅ MODELS
const User = mongoose.model("User", {
  name: String,
  phone: String,
  email: String,
  password: String,
});

const Booking = mongoose.model("Booking", {
  doctor: String,
  date: String,
  time: String,
  user: String,
  type: String, // 🔥 extra (transport/hotel)
});

// ✅ ROOT
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ================= AUTH =================

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    if (!name || (!phone && !email) || !password) {
      return res.json({ message: "All fields required" });
    }

    const user = new User({ name, phone, email, password });
    await user.save();

    res.json({ message: "User created" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN 🔥 FIXED
app.post("/api/login", async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    const user = await User.findOne({
      $or: [{ phone }, { email }],
      password,
    });

    if (!user) {
      return res.json({ message: "Invalid credentials" });
    }

    // 🔥 IMPORTANT
    res.json({ user });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

// ================= BOOKING =================

// DOCTOR BOOK
app.post("/api/book", async (req, res) => {
  try {
    const booking = new Booking(req.body);
    await booking.save();

    res.json({ message: "Booking saved ✅" });
  } catch (err) {
    res.status(500).json({ message: "Booking failed ❌" });
  }
});

// HOTEL BOOK
app.post("/api/hotel-book", async (req, res) => {
  try {
    const booking = new Booking({
      ...req.body,
      type: "hotel",
    });

    await booking.save();

    res.json({ message: "Hotel booked ✅" });
  } catch (err) {
    res.status(500).json({ message: "Hotel booking failed ❌" });
  }
});

// TRANSPORT BOOK
app.post("/api/transport-book", async (req, res) => {
  try {
    const booking = new Booking({
      ...req.body,
      type: "transport",
    });

    await booking.save();

    res.json({ message: "Transport booked ✅" });
  } catch (err) {
    res.status(500).json({ message: "Transport booking failed ❌" });
  }
});

// MY BOOKINGS
app.get("/api/my-bookings/:user", async (req, res) => {
  const data = await Booking.find({ user: req.params.user });
  res.json(data);
});

// ================= DOCTORS =================

app.get("/api/doctors", (req, res) => {
  res.json([
    {
      name: "Dr. Rahman",
      specialist: "Medicine",
      hospital: "Dhaka Medical",
      fee: 500,
      days: ["Sun", "Tue", "Thu"],
      time: "সকাল ১০টা - দুপুর ২টা",
    },
    {
      name: "Dr. Karim",
      specialist: "Cardiology",
      hospital: "Square Hospital",
      fee: 800,
      days: ["Mon", "Wed"],
      time: "বিকাল ৩টা - রাত ৮টা",
    },
  ]);
});

// ================= START =================
app.listen(process.env.PORT || 5000, () =>
  console.log("Server running 🚀")
);