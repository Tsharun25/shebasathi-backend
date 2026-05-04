import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";

dotenv.config();

const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());

const JWT_SECRET =
  process.env.JWT_SECRET || "shebasathi_secret_key_change_later";

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

const Hotel = mongoose.model("Hotel", {
  name: String,
  location: String,
  price: Number,
});

const Booking = mongoose.model("Booking", {
  bookingId: String,

  doctor: String,
  date: String,
  time: String,
  user: String,
  userName: String,
  type: String,

  status: { type: String, default: "Pending" },
  adminNote: { type: String, default: "" },

  from: String,
  to: String,
  fare: Number,
  vehicleType: String,
  acType: String,
  vehicle: String,
  ac: String,

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

// ================= HELPERS =================
const makeToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      phone: user.phone,
      email: user.email,
      role: user.role || "user",
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
};

const generateBookingId = async () => {
  const year = new Date().getFullYear();
  const count = await Booking.countDocuments();
  const serial = String(count + 1).padStart(4, "0");
  return `SB-${year}-${serial}`;
};

const adminOnly = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) return res.status(401).json({ message: "No token ❌" });

    const decoded = jwt.verify(token, JWT_SECRET);

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin only ❌" });
    }

    const dbUser = await User.findById(decoded.id);

    if (!dbUser || dbUser.role !== "admin") {
      return res.status(403).json({ message: "Admin only ❌" });
    }

    req.user = dbUser;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token ❌" });
  }
};

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("Server running ✅");
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    let { name, phone, email, password } = req.body;

    if (!name || (!phone && !email) || !password) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    name = name.trim();
    phone = phone?.trim() || null;
    email = email?.trim() || null;

    const exist = await User.findOne({
      $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    });

    if (exist) {
      return res.status(400).json({ message: "User already exists" });
    }

    const user = new User({ name, phone, email, password, role: "user" });
    await user.save();

    res.json({ message: "User created ✅" });
  } catch (err) {
    console.log("REGISTER ERROR:", err);
    res.status(500).json({ message: "Server error ❌" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    let { phone, email, password } = req.body;

    if ((!phone && !email) || !password) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    phone = phone?.trim();
    email = email?.trim();

    let user = null;

    if (phone) user = await User.findOne({ phone });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found ❌" });
    }

    if (user.password !== password) {
      return res.status(400).json({ message: "Wrong password ❌" });
    }

    const token = makeToken(user);

    res.json({
      message: "Login success ✅",
      token,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role || "user",
      },
    });
  } catch (err) {
    console.log("LOGIN ERROR:", err);
    res.status(500).json({ message: "Server error ❌" });
  }
});

// ================= PUBLIC DOCTORS/HOTELS =================
app.get("/api/doctors", async (req, res) => {
  try {
    const data = await Doctor.find().sort({ _id: -1 });
    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

app.get("/api/hotel", async (req, res) => {
  try {
    const data = await Hotel.find().sort({ _id: -1 });

    if (data.length === 0) {
      return res.json([
        { name: "Hotel Green", location: "Dhaka", price: 1500 },
        { name: "Hotel City", location: "Gazipur", price: 1000 },
      ]);
    }

    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

// ================= BOOKINGS =================
app.post("/api/book", async (req, res) => {
  try {
    const bookingId = await generateBookingId();

    const booking = new Booking({
      ...req.body,
      bookingId,
      type: "doctor",
      status: "Pending",
    });

    await booking.save();

    res.json({
      message: "Booking saved ✅",
      bookingId,
    });
  } catch (err) {
    console.log("DOCTOR BOOK ERROR:", err);
    res.status(500).json({ message: "Booking failed ❌" });
  }
});

app.post("/api/hotel-book", async (req, res) => {
  try {
    const { service, date, days, people, price, user, userName } = req.body;

    const bookingId = await generateBookingId();
    const total = Number(price) * Number(days || 1);

    const booking = new Booking({
      bookingId,
      type: "hotel",
      status: "Pending",
      service,
      date,
      days,
      people,
      price,
      total,
      user,
      userName,
    });

    await booking.save();

    res.json({
      message: "Hotel booking successful ✅",
      bookingId,
      total,
    });
  } catch (err) {
    console.log("HOTEL BOOK ERROR:", err);
    res.status(500).json({ message: "Server error ❌" });
  }
});

app.post("/api/transport-book", async (req, res) => {
  try {
    const { from, to } = req.body;

    const bookingId = await generateBookingId();

    const match = await Fare.findOne({
      $or: [
        { from, to },
        { from: to, to: from },
      ],
    });

    const fare = match ? match.fare : null;

    const booking = new Booking({
      ...req.body,
      bookingId,
      type: "transport",
      status: "Pending",
      fare,
    });

    await booking.save();

    res.json({
      message: "Transport booked ✅",
      bookingId,
      fare,
    });
  } catch (err) {
    console.log("TRANSPORT BOOK ERROR:", err);
    res.status(500).json({ message: "Transport booking failed ❌" });
  }
});

app.get("/api/my-bookings/:user", async (req, res) => {
  try {
    const data = await Booking.find({ user: req.params.user }).sort({
      _id: -1,
    });
    res.json(data);
  } catch {
    res.json([]);
  }
});

// ================= PUBLIC TRANSPORT =================
app.get("/api/transport", (req, res) => {
  res.json([
    { name: "Ambulance", location: "Dhaka", phone: "01700000000" },
    { name: "Car Service", location: "Gazipur", phone: "01800000000" },
  ]);
});

// ================= ADMIN BASIC =================
app.get("/api/admin/users", adminOnly, async (req, res) => {
  try {
    const data = await User.find().select("-password");
    res.json(data);
  } catch {
    res.status(500).json({ message: "Users load failed ❌" });
  }
});

app.get("/api/admin/bookings", adminOnly, async (req, res) => {
  try {
    const data = await Booking.find().sort({ _id: -1 });
    res.json(data);
  } catch {
    res.status(500).json({ message: "Bookings load failed ❌" });
  }
});

app.put("/api/admin/update-booking/:id", adminOnly, async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    await Booking.findByIdAndUpdate(req.params.id, {
      status,
      adminNote,
    });

    res.json({ message: "Booking updated ✅" });
  } catch (err) {
    console.log("UPDATE BOOKING ERROR:", err);
    res.status(500).json({ message: "Booking update failed ❌" });
  }
});

app.delete("/api/admin/delete-booking/:id", adminOnly, async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted ✅" });
  } catch {
    res.status(500).json({ message: "Delete failed ❌" });
  }
});

// ================= ADMIN DOCTOR CRUD =================
app.get("/api/admin/doctors", adminOnly, async (req, res) => {
  try {
    const data = await Doctor.find().sort({ _id: -1 });
    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

app.post("/api/admin/add-doctor", adminOnly, async (req, res) => {
  try {
    const { name, specialist, hospital, fee, days, start, end } = req.body;

    if (!name || !specialist || !hospital || !fee) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    const doctor = new Doctor({
      name,
      specialist,
      hospital,
      fee: Number(fee),
      days:
        typeof days === "string"
          ? days
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : days || [],
      time: {
        start: start || "",
        end: end || "",
      },
    });

    await doctor.save();
    res.json({ message: "Doctor added ✅" });
  } catch (err) {
    console.log("ADD DOCTOR ERROR:", err);
    res.status(500).json({ message: "Doctor add failed ❌" });
  }
});

app.put("/api/admin/update-doctor/:id", adminOnly, async (req, res) => {
  try {
    const { name, specialist, hospital, fee, days, start, end } = req.body;

    await Doctor.findByIdAndUpdate(req.params.id, {
      name,
      specialist,
      hospital,
      fee: Number(fee),
      days:
        typeof days === "string"
          ? days
              .split(",")
              .map((d) => d.trim())
              .filter(Boolean)
          : days || [],
      time: {
        start: start || "",
        end: end || "",
      },
    });

    res.json({ message: "Doctor updated ✅" });
  } catch (err) {
    console.log("UPDATE DOCTOR ERROR:", err);
    res.status(500).json({ message: "Doctor update failed ❌" });
  }
});

app.delete("/api/admin/delete-doctor/:id", adminOnly, async (req, res) => {
  try {
    await Doctor.findByIdAndDelete(req.params.id);
    res.json({ message: "Doctor deleted ✅" });
  } catch {
    res.status(500).json({ message: "Doctor delete failed ❌" });
  }
});

// ================= ADMIN HOTEL CRUD =================
app.get("/api/admin/hotels", adminOnly, async (req, res) => {
  try {
    const data = await Hotel.find().sort({ _id: -1 });
    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

app.post("/api/admin/add-hotel", adminOnly, async (req, res) => {
  try {
    const { name, location, price } = req.body;

    if (!name || !location || !price) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    const hotel = new Hotel({
      name,
      location,
      price: Number(price),
    });

    await hotel.save();
    res.json({ message: "Hotel added ✅" });
  } catch (err) {
    console.log("ADD HOTEL ERROR:", err);
    res.status(500).json({ message: "Hotel add failed ❌" });
  }
});

app.put("/api/admin/update-hotel/:id", adminOnly, async (req, res) => {
  try {
    const { name, location, price } = req.body;

    await Hotel.findByIdAndUpdate(req.params.id, {
      name,
      location,
      price: Number(price),
    });

    res.json({ message: "Hotel updated ✅" });
  } catch {
    res.status(500).json({ message: "Hotel update failed ❌" });
  }
});

app.delete("/api/admin/delete-hotel/:id", adminOnly, async (req, res) => {
  try {
    await Hotel.findByIdAndDelete(req.params.id);
    res.json({ message: "Hotel deleted ✅" });
  } catch {
    res.status(500).json({ message: "Hotel delete failed ❌" });
  }
});

// ================= ADMIN FARE =================
app.post("/api/admin/add-fare", adminOnly, async (req, res) => {
  try {
    const { from, to, fare } = req.body;

    if (!from || !to || !fare) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
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
    res.status(500).json({ message: "Fare save failed ❌" });
  }
});

app.get("/api/admin/fares", adminOnly, async (req, res) => {
  try {
    const data = await Fare.find();
    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

// ================= OTP =================
const otpStore = {};

app.post("/api/send-otp", (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.status(400).json({ message: "Phone required" });

  const otp = Math.floor(100000 + Math.random() * 900000);
  otpStore[phone] = otp;

  console.log("OTP:", otp);

  res.json({ message: "OTP sent" });
});

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { phone, otp } = req.body;

    if (otpStore[phone] != otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({ phone, name: "User", role: "user" });
      await user.save();
    }

    delete otpStore[phone];

    const token = makeToken(user);

    res.json({
      message: "Login success ✅",
      token,
      user: {
        _id: user._id,
        name: user.name,
        phone: user.phone,
        email: user.email,
        role: user.role || "user",
      },
    });
  } catch {
    res.status(500).json({ message: "OTP verify failed ❌" });
  }
});

// ================= START =================
app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running on port ${process.env.PORT || 5000} 🚀`);
});