require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
app.use(express.json());

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

// DB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("Mongo Connected ✅"))
  .catch(() => console.log("Mongo Error ❌"));

// ================= SCHEMA =================

// TRANSPORT
const Transport = mongoose.model("Transport", {
  name: String,
  type: String, // ambulance/car
  phone: String,
  location: String,
});

// HOTEL
const Hotel = mongoose.model("Hotel", {
  name: String,
  location: String,
  price: Number,
});

// BOOKINGS
const TransportBooking = mongoose.model("TransportBooking", {
  name: String,
  phone: String,
  location: String,
  date: String,
});

const HotelBooking = mongoose.model("HotelBooking", {
  name: String,
  phone: String,
  location: String,
  date: String,
});

// ================= ROUTES =================

// GET TRANSPORT
app.get("/api/transport", async (req, res) => {
  const data = await Transport.find();
  res.json(data);
});

// BOOK TRANSPORT
app.post("/api/transport-book", async (req, res) => {
  await new TransportBooking(req.body).save();
  res.json({ message: "🚑 বুকিং সফল" });
});

// GET HOTEL
app.get("/api/hotel", async (req, res) => {
  const data = await Hotel.find();
  res.json(data);
});

// BOOK HOTEL
app.post("/api/hotel-book", async (req, res) => {
  await new HotelBooking(req.body).save();
  res.json({ message: "🏨 বুকিং সফল" });
});

// SEED
app.get("/seed-services", async (req, res) => {
  await Transport.deleteMany();
  await Hotel.deleteMany();

  await Transport.insertMany([
    {
      name: "ঢাকা অ্যাম্বুলেন্স সার্ভিস",
      type: "Ambulance",
      phone: "01700000000",
      location: "ঢাকা",
    },
  ]);

  await Hotel.insertMany([
    {
      name: "সিটি গেস্ট হাউস",
      location: "ঢাকা মেডিকেল এর পাশে",
      price: 1000,
    },
  ]);

  res.send("Services Seed Done ✅");
});

app.listen(5000, () => console.log("Server running 🚀"));