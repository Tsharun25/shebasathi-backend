import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const adminOnly = (req, res, next) => {
  if (req.body.role !== "admin") {
    return res.status(403).json({ message: "Access denied" });
  }
  next();
};

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
  role: { type: String, default: "user" },
});

const Doctor = mongoose.model("Doctor", {
  name: String,
  specialist: String,
  hospital: String,
  fee: Number,
  days: [String],
  time: {
    start: String,
    end: String,
  },
});

const Booking = mongoose.model("Booking", {
  doctor: String,
  date: String,
  time: String,
  user: String,
  type: String,

  // transport
  from: String,
  to: String,
  fare: Number,

  // hotel
  service: String,
  days: Number,
  people: Number,
  price: Number,
  total: Number,
});

const Fare = mongoose.model("Fare", {
  from: String,
  to: String,
  fare: Number,
});

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ================= AUTH =================

// REGISTER
app.post("/api/register", async (req, res) => {
  try {
    const { name, phone, email, password } = req.body;

    if (!name || (!phone && !email) || !password) {
      return res.json({ message: "সব তথ্য দিন" });
    }

    const exist = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (exist) {
      return res.json({ message: "User already exists" });
    }

    const user = new User({ name, phone, email, password });
    await user.save();

    res.json({ message: "User created" });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN
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

    res.json({
      message: "Login success",
      user,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= DOCTORS =================
app.get("/api/doctors", async (req, res) => {
  const data = await Doctor.find();
  res.json(data);
});

// ================= BOOKING =================

// DOCTOR
app.post("/api/book", async (req, res) => {
  try {
    const booking = new Booking({
      ...req.body,
      type: "doctor",
    });

    await booking.save();

    res.json({ message: "Booking saved ✅" });
  } catch {
    res.status(500).json({ message: "Booking failed ❌" });
  }
});

// HOTEL
app.post("/api/hotel-book", async (req, res) => {
  try {
    const { service, date, days, people, price, user } = req.body;

    const total = Number(price) * Number(days || 1);

    const booking = new Booking({
      type: "hotel",
      service,
      date,
      days,
      people,
      price,
      total,
      user,
    });

    await booking.save();

    res.json({
      message: "Hotel booking successful ✅",
      total,
    });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
});

// ================= TRANSPORT (FIXED) =================
app.post("/api/transport-book", async (req, res) => {
  try {
    const { from, to } = req.body;

    const match = await Fare.findOne({
      $or: [
        { from, to },
        { from: to, to: from },
      ],
    });

    const fare = match ? match.fare : null;

    const booking = new Booking({
      ...req.body,
      type: "transport",
      fare,
    });

    await booking.save();

    res.json({
      message: "Transport booked ✅",
      fare,
    });
  } catch {
    res.status(500).json({ message: "Transport booking failed ❌" });
  }
});

// ADD FARE
app.post("/api/admin/add-fare", async (req, res) => {
  try {
    const { from, to, fare } = req.body;

    if (!from || !to || !fare) {
      return res.json({ message: "সব তথ্য দিন" });
    }

    const exist = await Fare.findOne({ from, to });

    if (exist) {
      exist.fare = fare;
      await exist.save();
      return res.json({ message: "Fare updated ✅" });
    }

    const newFare = new Fare({ from, to, fare });
    await newFare.save();

    res.json({ message: "Fare added ✅" });
  } catch {
    res.status(500).json({ message: "Error ❌" });
  }
});

// ================= MY BOOKINGS =================
app.get("/api/my-bookings/:user", async (req, res) => {
  try {
    const data = await Booking.find({ user: req.params.user });
    res.json(data);
  } catch {
    res.json([]);
  }
});

// ================= STATIC LIST =================
app.get("/api/transport", (req, res) => {
  res.json([
    { name: "Ambulance", location: "Dhaka", phone: "01700000000" },
    { name: "Car Service", location: "Gazipur", phone: "01800000000" },
  ]);
});

app.get("/api/hotel", (req, res) => {
  res.json([
    { name: "Hotel Green", location: "Dhaka", price: 1500 },
    { name: "Hotel City", location: "Gazipur", price: 1000 },
  ]);
});

app.get("/api/admin/fares", async (req, res) => {
  const data = await Fare.find();
  res.json(data);
});

// ================= ADMIN =================

// ADD DOCTOR
app.post("/api/admin/add-doctor", async (req, res) => {
  const doctor = new Doctor(req.body);
  await doctor.save();
  res.json({ message: "Doctor added ✅" });
});

// USERS
app.get("/api/admin/users", async (req, res) => {
  const data = await User.find();
  res.json(data);
});

// BOOKINGS
app.get("/api/admin/bookings", async (req, res) => {
  const data = await Booking.find();
  res.json(data);
});

// DELETE BOOKING
app.delete("/api/admin/delete-booking/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});

// ================= OTP =================
const otpStore = {};

// SEND OTP
app.post("/api/send-otp", (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.json({ message: "Phone required" });

  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[phone] = otp;

  console.log("OTP:", otp);

  res.json({ message: "OTP sent" });
});

// VERIFY OTP
app.post("/api/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;

  if (otpStore[phone] != otp) {
    return res.json({ message: "Invalid OTP" });
  }

  let user = await User.findOne({ phone });

  if (!user) {
    user = new User({ phone, name: "User" });
    await user.save();
  }

  delete otpStore[phone];

  res.json({
    message: "Login success",
    user,
  });
});


// ================= START =================
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port 5000 🚀");
});
