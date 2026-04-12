const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

app.use(cors());
app.use(express.json());

// 🔗 MongoDB connect
mongoose
  .connect(
    "mongodb://Tsharun:Tsharun26@ac-x2kwtsi-shard-00-00.hlaqmbz.mongodb.net:27017,ac-x2kwtsi-shard-00-01.hlaqmbz.mongodb.net:27017,ac-x2kwtsi-shard-00-02.hlaqmbz.mongodb.net:27017/?ssl=true&replicaSet=atlas-2dlxa7-shard-0&authSource=admin&appName=Cluster0shebasathi",
  )
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log(err));

// 🔥 User Schema
const User = mongoose.model("User", {
  name: String,
  email: String,
  password: String,
});

// 🔥 Doctor Schema
const Doctor = mongoose.model("Doctor", {
  name: String,
  department: String,
  hospital: String,
  fee: Number,
});

// ================== AUTH ==================

// REGISTER
app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const user = new User({ name, email, password: hashed });
  await user.save();

  res.json({ message: "Registered" });
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "User not found" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: "Wrong password" });

  const token = jwt.sign({ id: user._id }, "secret");

  res.json({
    token,
    user: {
      name: user.name,
      email: user.email,
    },
  });
});

// ================== DOCTORS ==================

app.get("/api/doctors", async (req, res) => {
  const doctors = await Doctor.find();
  res.json(doctors);
});

// TEST DATA INSERT
app.get("/seed", async (req, res) => {
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

  res.send("Seed Done");
});

// ===========================================

app.listen(5000, () => console.log("Server running"));
