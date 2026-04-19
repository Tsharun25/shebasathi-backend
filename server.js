import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

dotenv.config();

const app = express();
app.use(
  cors({
    origin: "*",
  }),
);
app.use(express.json());


const fareMap = {
  "Dhaka-Gazipur": 500,
  "Dhaka-Rangpur": 1200,
  "Dhaka-Chittagong": 1500,
  "Gazipur-Dhaka": 500,
  "Rangpur-Dhaka": 1200,
};

const fareList = [
  { from: "Dhaka", to: "Gazipur", fare: 500 },
  { from: "Dhaka", to: "Rangpur", fare: 1200 },
];



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
  role: { type: String, default: "user" }, // ✅ NEW
});

// const Fare = mongoose.model("Fare", {
//   from: String,
//   to: String,
//   fare: Number,
// });

// const Doctor = mongoose.model("Doctor", {
//   name: String,
//   specialist: String,
//   hospital: String,
//   fee: Number,
//   days: [String],
//   time: String,
// });

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

// const Booking = mongoose.model("Booking", {
//   doctor: String,
//   date: String,
//   time: String,
//   user: String,
//   type: String,

//   from: String,
//   to: String,

//   service: String,
//   days: Number,
//   people: Number,
//   price: Number,
//   total: Number, // 🔥 ADD THIS
// });

const Booking = mongoose.model("Booking", {
  doctor: String,
  date: String,
  time: String,
  user: String,
  type: String,
  from: String,
  to: String,
  service: String,
  fare: Number, // ✅ ADD THIS
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

    // duplicate check
    const exist = await User.findOne({
      $or: [{ phone }, { email }],
    });

    if (exist) {
      return res.json({ message: "User already exists" });
    }

    const user = new User({ name, phone, email, password });
    await user.save();

    res.json({ message: "User created" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

// LOGIN 🔥 FINAL FIX
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

    // ✅ FIXED RESPONSE FORMAT
    res.json({
      message: "Login success",
      user: user,
    });
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ message: "Booking failed ❌" });
  }
});

// HOTEL
app.post("/api/hotel-book", async (req, res) => {
  try {
    const { service, date, days, people, price, user } = req.body;

    const total = price * Number(days || 1);

    const booking = new Booking({
      type: "hotel",
      service,
      date,
      days,
      people,
      price,
      total, // 🔥 important
      user,
    });

    await booking.save();

    res.json({ message: "Hotel booking successful ✅" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

// TRANSPORT
// // app.post("/api/transport-book", async (req, res) => {
// //   try {
// //     const { from, to, date, user } = req.body;

// //     // 🔥 SIMPLE DISTANCE BASED FARE (demo logic)
// //     let baseFare = 200;

// //     if (from !== to) {
// //       baseFare += 100; // different location charge
// //     }

// //     const total = baseFare;

// //     const booking = new Booking({
// //       type: "transport",
// //       from,
// //       to,
// //       date,
// //       total, // 🔥 save fare
// //       user,
// //     });

// //     await booking.save();

// //     res.json({
// //       message: "Transport booked ✅",
// //       total,
// //     });
// //   } catch (err) {
// //     res.status(500).json({ message: "Transport booking failed ❌" });
// //   }
// // });

// app.post("/api/transport-book", async (req, res) => {
//   try {
//     const { from, to } = req.body;

//     const key = `${from}-${to}`;
//     const reverseKey = `${to}-${from}`;

//     let fare = fareMap[key] || fareMap[reverseKey] || null;

//     const booking = new Booking({
//       ...req.body,
//       type: "transport",
//       fare: fare, // ✅ save fare
//     });

//     await booking.save();

//     res.json({
//       message: "Transport booked ✅",
//       fare: fare,
//     });

//   } catch (err) {
//     res.status(500).json({ message: "Transport booking failed ❌" });
//   }
// });

app.post("/api/transport-book", async (req, res) => {
  try {
    const { from, to } = req.body;

    const match = fareList.find(
      (f) =>
        (f.from === from && f.to === to) ||
        (f.from === to && f.to === from)
    );

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

  } catch (err) {
    res.status(500).json({ message: "Transport booking failed ❌" });
  }
});

// ================= MY BOOKINGS =================

app.get("/api/my-bookings/:user", async (req, res) => {
  try {
    const data = await Booking.find({ user: req.params.user });
    res.json(data);
  } catch (err) {
    res.json([]);
  }
});

// ================= TRANSPORT LIST =================
app.get("/api/transport", (req, res) => {
  res.json([
    { name: "Ambulance", location: "Dhaka", phone: "01700000000" },
    { name: "Car Service", location: "Gazipur", phone: "01800000000" },
  ]);
});

// ================= HOTEL LIST =================
app.get("/api/hotel", (req, res) => {
  res.json([
    { name: "Hotel Green", location: "Dhaka", price: 1500 },
    { name: "Hotel City", location: "Gazipur", price: 1000 },
  ]);
});

// ADD DOCTOR (ADMIN)
app.post("/api/add-doctor", async (req, res) => {
  try {
    const doc = new Doctor(req.body);
    await doc.save();
    res.json({ message: "Doctor added ✅" });
  } catch {
    res.status(500).json({ message: "Failed ❌" });
  }
});

app.delete("/api/cancel-booking/:id", async (req, res) => {
  try {
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch {
    res.status(500).json({ message: "Error" });
  }
});

// ================= OTP =================

const otpStore = {}; // temp memory (later DB use korbi)

// SEND OTP
app.post("/api/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone) return res.json({ message: "Phone required" });

  const otp = Math.floor(100000 + Math.random() * 900000);

  otpStore[phone] = otp;

  console.log("OTP:", otp); // 🔥 testing (SMS er jaygay)

  res.json({ message: "OTP sent" });
});

// VERIFY OTP
app.post("/api/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;

  if (otpStore[phone] != otp) {
    return res.json({ message: "Invalid OTP" });
  }

  // user create / login
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


// ================= ADMIN =================

// ALL USERS
app.get("/api/admin/users", async (req, res) => {
  const data = await User.find();
  res.json(data);
});

// ALL BOOKINGS
app.get("/api/admin/bookings", async (req, res) => {
  const data = await Booking.find();
  res.json(data);
});

// ADD DOCTOR
app.post("/api/admin/add-doctor", async (req, res) => {
  const doctor = new Doctor(req.body);
  await doctor.save();
  res.json({ message: "Doctor added ✅" });
});

const adminOnly = (req, res, next) => {
  if (req.body.role !== "admin") {
    return res.status(403).json({ message: "Access denied ❌" });
  }
  next();
};


app.delete("/api/admin/delete-booking/:id", async (req, res) => {
  await Booking.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
});


const fares = {
  "Dhaka-Gazipur": 300,
  "Dhaka-Chittagong": 800,
  "Dhaka-Sylhet": 700,
};

app.post("/api/transport-book", async (req, res) => {
  const { from, to, user } = req.body;

  const key = `${from}-${to}`;
  const fare = fares[key] || 500; // default

  const booking = new Booking({
    from,
    to,
    user,
    type: "transport",
    fare,
  });

  await booking.save();

  res.json({
    message: "Transport booked ✅",
    fare,
  });
});

// ================= START =================
app.listen(process.env.PORT || 5000, () => {
  console.log("Server running on port 5000 🚀");
});
