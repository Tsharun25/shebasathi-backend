import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ================= DB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => console.log("DB ERROR:", err));

// ================= MODELS =================
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
  type: String,
  from: String,
  to: String,
  service: String,
});

// ================= ROUTES =================
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ✅ REGISTER FIXED
app.post("/api/register", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    if (!name || (!phone && !email) || !password) {
      return res.json({ message: "All fields required" });
    }

    // 🔥 DUPLICATE CHECK
    const existing = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (existing) {
      return res.json({ message: "User already exists" });
    }

    const newUser = new User({ name, phone, email, password });
    await newUser.save();

    res.json({ message: "User created" });
  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ LOGIN FIXED
app.post("/api/login", async (req, res) => {
  try {
    const { phone, email, password } = req.body;

    if ((!phone && !email) || !password) {
      return res.json({ message: "All fields required" });
    }

    const user = await User.findOne({
      $or: [{ phone }, { email }],
      password,
    });

    if (!user) {
      return res.json({ message: "Invalid credentials" });
    }

    res.json({ user });
  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ✅ BOOKING
app.post("/api/book", async (req, res) => {
  try {
    const booking = new Booking(req.body);
    await booking.save();
    res.json({ message: "Booking saved ✅" });
  } catch (err) {
    res.status(500).json({ message: "Booking error" });
  }
});

// ✅ MY BOOKINGS
app.get("/api/my-bookings/:user", async (req, res) => {
  try {
    const data = await Booking.find({ user: req.params.user });
    res.json(data);
  } catch (err) {
    res.status(500).json([]);
  }
});

// ================= START =================
app.listen(process.env.PORT || 5000, () =>
  console.log("Server running on port 5000")
);