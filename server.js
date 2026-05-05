import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

dotenv.config();

const app = express();

// ================= CONFIG =================
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error("JWT_SECRET missing in .env ❌");
  process.exit(1);
}

const allowedOrigins = [
  "http://localhost:3000",
  "https://shebasathi-next.vercel.app",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));

// ================= DB =================
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected ✅"))
  .catch((err) => {
    console.log("DB ERROR:", err.message);
    process.exit(1);
  });

// ================= MODELS =================
const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    phone: { type: String, trim: true, unique: true, sparse: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    password: { type: String },
    role: { type: String, enum: ["user", "admin"], default: "user" },
  },
  { timestamps: true }
);

const doctorSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    specialist: { type: String, required: true, trim: true },
    hospital: { type: String, required: true, trim: true },
    fee: { type: Number, required: true },
    days: [{ type: String }],
    time: {
      start: String,
      end: String,
    },
  },
  { timestamps: true }
);

const hotelSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
  },
  { timestamps: true }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingId: { type: String, unique: true },

    type: {
      type: String,
      enum: ["doctor", "hotel", "transport"],
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Confirmed", "Completed", "Cancelled"],
      default: "Pending",
    },

    adminNote: { type: String, default: "" },

    user: String,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    userName: String,

    doctor: String,
    date: String,
    time: String,

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
    rooms: Number,

    isNew: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const fareSchema = new mongoose.Schema(
  {
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    fare: { type: Number, required: true },
  },
  { timestamps: true }
);

const counterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  value: { type: Number, default: 0 },
});

const User = mongoose.models.User || mongoose.model("User", userSchema);
const Doctor = mongoose.models.Doctor || mongoose.model("Doctor", doctorSchema);
const Hotel = mongoose.models.Hotel || mongoose.model("Hotel", hotelSchema);
const Booking = mongoose.models.Booking || mongoose.model("Booking", bookingSchema);
const Fare = mongoose.models.Fare || mongoose.model("Fare", fareSchema);
const Counter = mongoose.models.Counter || mongoose.model("Counter", counterSchema);

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

  const counter = await Counter.findOneAndUpdate(
    { name: `booking-${year}` },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  );

  const serial = String(counter.value).padStart(4, "0");
  return `SB-${year}-${serial}`;
};

const normalizePhone = (phone) => {
  if (!phone) return null;
  return String(phone).trim();
};

const normalizeEmail = (email) => {
  if (!email) return null;
  return String(email).trim().toLowerCase();
};

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.split(" ")[1]
      : null;

    if (!token) {
      return res.status(401).json({ message: "Login required ❌" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const dbUser = await User.findById(decoded.id).select("-password");

    if (!dbUser) {
      return res.status(401).json({ message: "User not found ❌" });
    }

    req.user = dbUser;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token ❌" });
  }
};

const adminOnly = async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {
      if (req.user.role !== "admin") {
        return res.status(403).json({ message: "Admin only ❌" });
      }

      next();
    });
  } catch {
    return res.status(401).json({ message: "Invalid token ❌" });
  }
};

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("ShebaSathi server running ✅");
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    message: "ShebaSathi API healthy ✅",
  });
});

// ================= AUTH =================
app.post("/api/register", async (req, res) => {
  try {
    let { name, phone, email, password } = req.body;

    name = name?.trim();
    phone = normalizePhone(phone);
    email = normalizeEmail(email);

    if (!name || (!phone && !email) || !password) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        message: "Password কমপক্ষে ৬ অক্ষরের হতে হবে",
      });
    }

    const exist = await User.findOne({
      $or: [...(phone ? [{ phone }] : []), ...(email ? [{ email }] : [])],
    });

    if (exist) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = new User({
      name,
      phone,
      email,
      password: hashedPassword,
      role: "user",
    });

    await user.save();

    res.status(201).json({ message: "User created ✅" });
  } catch (err) {
    console.log("REGISTER ERROR:", err.message);
    res.status(500).json({ message: "Server error ❌" });
  }
});


app.post("/api/login", async (req, res) => {
  try {
    let { phone, email, password } = req.body;

    phone = normalizePhone(phone);
    email = normalizeEmail(email);

    if ((!phone && !email) || !password) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    let user = null;

    if (phone) user = await User.findOne({ phone });
    if (!user && email) user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "User not found ❌" });
    }

    if (!user.password) {
      return res.status(400).json({
        message: "এই account OTP দিয়ে তৈরি। OTP দিয়ে login করুন।",
      });
    }

    let isMatch = false;

    const passwordLooksHashed =
      user.password.startsWith("$2a$") ||
      user.password.startsWith("$2b$") ||
      user.password.startsWith("$2y$");

    if (passwordLooksHashed) {
      isMatch = await bcrypt.compare(password, user.password);
    } else {
      isMatch = user.password === password;

      if (isMatch) {
        user.password = await bcrypt.hash(password, 12);
        await user.save();
      }
    }

    if (!isMatch) {
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
    console.log("LOGIN ERROR:", err.message);
    res.status(500).json({ message: "Server error ❌" });
  }
});

app.get("/api/me", requireAuth, async (req, res) => {
  res.json({
    user: {
      _id: req.user._id,
      name: req.user.name,
      phone: req.user.phone,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// ================= PUBLIC DOCTORS/HOTELS =================
app.get("/api/doctors", async (req, res) => {
  try {
    const data = await Doctor.find().sort({ createdAt: -1 });
    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

app.get("/api/hotel", async (req, res) => {
  try {
    const data = await Hotel.find().sort({ createdAt: -1 });

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
app.post("/api/book", requireAuth, async (req, res) => {
  try {
    const { doctor, date, time } = req.body;

    if (!doctor || !date || !time) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    const bookingId = await generateBookingId();

    const booking = new Booking({
      doctor,
      date,
      time,
      bookingId,
      type: "doctor",
      status: "Pending",
      user: req.user.phone || req.user.email,
      userId: req.user._id,
      userName: req.user.name || "User",
    });

    await booking.save();

    res.status(201).json({
      message: "Booking saved ✅",
      bookingId,
    });
  } catch (err) {
    console.log("DOCTOR BOOK ERROR:", err.message);
    res.status(500).json({ message: "Booking failed ❌" });
  }
});

app.post("/api/hotel-book", requireAuth, async (req, res) => {
  try {
    const { service, date, days, people, rooms, price } = req.body;

    if (!service || !date || !days || !people || !rooms || !price) {
      return res.status(400).json({ message: "সব তথ্য দিন" });
    }

    const bookingId = await generateBookingId();

    const total =
      Number(price) * Number(days || 1) * Number(rooms || 1);

    const booking = new Booking({
      bookingId,
      type: "hotel",
      status: "Pending",
      service,
      date,
      days: Number(days),
      people: Number(people),
      rooms: Number(rooms),
      price: Number(price),
      total,
      user: req.user.phone || req.user.email,
      userId: req.user._id,
      userName: req.user.name || "User",
    });

    await booking.save();

    res.status(201).json({
      message: "Hotel booking successful ✅",
      bookingId,
      total,
    });
  } catch (err) {
    console.log("HOTEL BOOK ERROR:", err.message);
    res.status(500).json({ message: "Server error ❌" });
  }
});

app.post("/api/transport-book", requireAuth, async (req, res) => {
  try {
    const { from, to } = req.body;

    if (!from || !to) {
      return res.status(400).json({ message: "From এবং To দিন" });
    }

    const bookingId = await generateBookingId();

    const match = await Fare.findOne({
      $or: [
        { from, to },
        { from: to, to: from },
      ],
    });

    const fare = match ? Number(match.fare) : null;

    const booking = new Booking({
      ...req.body,
      bookingId,
      type: "transport",
      status: "Pending",
      fare,
      user: req.user.phone || req.user.email,
      userId: req.user._id,
      userName: req.user.name || "User",
    });

    await booking.save();

    res.status(201).json({
      message: "Transport booked ✅",
      bookingId,
      fare,
    });
  } catch (err) {
    console.log("TRANSPORT BOOK ERROR:", err.message);
    res.status(500).json({ message: "Transport booking failed ❌" });
  }
});

app.get("/api/my-bookings/:user", requireAuth, async (req, res) => {
  try {
    const requestedUser = req.params.user;

    const isOwner =
      requestedUser === req.user.phone ||
      requestedUser === req.user.email ||
      requestedUser === String(req.user._id);

    if (!isOwner && req.user.role !== "admin") {
      return res.status(403).json({ message: "Access denied ❌" });
    }

    const data = await Booking.find({
      $or: [
        { user: req.user.phone },
        { user: req.user.email },
        { userId: req.user._id },
      ],
    }).sort({ createdAt: -1 });

    res.json(data);
  } catch {
    res.json([]);
  }
});

app.get("/api/my-bookings", requireAuth, async (req, res) => {
  try {
    const data = await Booking.find({
      $or: [
        { user: req.user.phone },
        { user: req.user.email },
        { userId: req.user._id },
      ],
    }).sort({ createdAt: -1 });

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
app.get("/api/admin/new-bookings-count", adminOnly, async (req, res) => {
  try {
    const count = await Booking.countDocuments({ isNew: true });
    res.json({ count });
  } catch {
    res.status(500).json({ count: 0 });
  }
});

app.post("/api/admin/mark-seen", adminOnly, async (req, res) => {
  try {
    await Booking.updateMany({ isNew: true }, { isNew: false });
    res.json({ message: "Updated ✅" });
  } catch {
    res.status(500).json({ message: "Failed ❌" });
  }
});

app.get("/api/admin/users", adminOnly, async (req, res) => {
  try {
    const data = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(data);
  } catch {
    res.status(500).json({ message: "Users load failed ❌" });
  }
});

app.get("/api/admin/bookings", adminOnly, async (req, res) => {
  try {
    const data = await Booking.find().sort({ createdAt: -1 });
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
      adminNote: adminNote || "",
    });

    res.json({ message: "Booking updated ✅" });
  } catch (err) {
    console.log("UPDATE BOOKING ERROR:", err.message);
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
    const data = await Doctor.find().sort({ createdAt: -1 });
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
      name: name.trim(),
      specialist: specialist.trim(),
      hospital: hospital.trim(),
      fee: Number(fee),
      days:
        typeof days === "string"
          ? days.split(",").map((d) => d.trim()).filter(Boolean)
          : days || [],
      time: {
        start: start || "",
        end: end || "",
      },
    });

    await doctor.save();
    res.status(201).json({ message: "Doctor added ✅" });
  } catch (err) {
    console.log("ADD DOCTOR ERROR:", err.message);
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
          ? days.split(",").map((d) => d.trim()).filter(Boolean)
          : days || [],
      time: {
        start: start || "",
        end: end || "",
      },
    });

    res.json({ message: "Doctor updated ✅" });
  } catch (err) {
    console.log("UPDATE DOCTOR ERROR:", err.message);
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
    const data = await Hotel.find().sort({ createdAt: -1 });
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
      name: name.trim(),
      location: location.trim(),
      price: Number(price),
    });

    await hotel.save();
    res.status(201).json({ message: "Hotel added ✅" });
  } catch (err) {
    console.log("ADD HOTEL ERROR:", err.message);
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

    const fromText = from.trim();
    const toText = to.trim();

    const exist = await Fare.findOne({ from: fromText, to: toText });

    if (exist) {
      exist.fare = Number(fare);
      await exist.save();
      return res.json({ message: "Fare updated ✅" });
    }

    const newFare = new Fare({
      from: fromText,
      to: toText,
      fare: Number(fare),
    });

    await newFare.save();

    res.status(201).json({ message: "Fare added ✅" });
  } catch {
    res.status(500).json({ message: "Fare save failed ❌" });
  }
});

app.get("/api/admin/fares", adminOnly, async (req, res) => {
  try {
    const data = await Fare.find().sort({ createdAt: -1 });
    res.json(data);
  } catch {
    res.status(500).json([]);
  }
});

// ================= OTP =================
const otpStore = {};

app.post("/api/send-otp", (req, res) => {
  const phone = normalizePhone(req.body.phone);

  if (!phone) {
    return res.status(400).json({ message: "Phone required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[phone] = {
    otp,
    expiresAt: Date.now() + 5 * 60 * 1000,
  };

  console.log(`OTP for ${phone}:`, otp);

  res.json({ message: "OTP sent" });
});

app.post("/api/verify-otp", async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const otp = String(req.body.otp || "").trim();

    if (!phone || !otp) {
      return res.status(400).json({ message: "Phone এবং OTP দিন" });
    }

    const saved = otpStore[phone];

    if (!saved) {
      return res.status(400).json({ message: "OTP পাওয়া যায়নি" });
    }

    if (Date.now() > saved.expiresAt) {
      delete otpStore[phone];
      return res.status(400).json({ message: "OTP expired" });
    }

    if (String(saved.otp) !== otp) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    let user = await User.findOne({ phone });

    if (!user) {
      user = new User({
        phone,
        name: "User",
        role: "user",
      });
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
  } catch (err) {
    console.log("OTP VERIFY ERROR:", err.message);
    res.status(500).json({ message: "OTP verify failed ❌" });
  }
});

// ================= 404 =================
app.use((req, res) => {
  res.status(404).json({ message: "API route not found ❌" });
});

// ================= START =================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} 🚀`);
});