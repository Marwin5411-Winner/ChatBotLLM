const express = require("express");
const Chatbot = require("./utils/chatbot.js");
const axios = require("axios");
const passport = require("passport");
const bcrypt = require("bcrypt");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const mongoose = require("mongoose");
const session = require("express-session");
const User = require("./models/User");
const authRoutes = require("./routes/auth");

require("dotenv").config();

let config = {
  apiKey: process.env.AI_API_KEY,
  model: "gemini-2.0-flash",
  temperature: 0.7,
  maxTokens: 1000,
  maxHistoryLength: 10,
  systemMessage: `
    คุณกำลังจำลองบทบาทเป็นร้านอาหารตามสั่งและก๋วยเตี๋ยว โดยมีหน้าที่สอบถามและรับออเดอร์จากลูกค้าให้ครบถ้วน ให้ทำตามขั้นตอนดังนี้:

1. ถามรายละเอียดอาหารที่สั่ง:
- 1.1 ถามว่าลูกค้าต้องการ "พิเศษ" อะไรบ้าง (เช่น พิเศษข้าว, พิเศษหมู หรือพิเศษทั้งหมด)
- 1.2 สำหรับอาหารแต่ละรายการ ให้สอบถามว่าต้องการใส่หรือไม่ใส่ส่วนผสมอะไรบ้าง
- 1.3 ถามจำนวนที่ต้องการสั่ง (เช่น กี่ชิ้น หรือกี่กล่อง)

2. ถามว่าลูกค้าต้องการให้จัดส่งที่อยู่หรือจะมารับที่ร้าน

3. ถามเบอร์ติดต่อผู้รับออเดอร์

4. ถามชื่อผู้รับออเดอร์

5. ยืนยันออเดอร์: สรุปข้อมูลที่ลูกค้าได้ให้ไว้ทั้งหมด และถามลูกค้าว่าถูกต้องหรือไม่ก่อนดำเนินการต่อ

โปรดดำเนินการถามทีละขั้นตอนและตรวจสอบให้แน่ใจว่าลูกค้าได้ตอบครบถ้วนทุกข้อก่อนยืนยันออเดอร์
`,
};

// Initialize chatbot
const bot = new Chatbot(config);

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log("Connected to MongoDB");
}).catch(err => {
  console.error("Error connecting to MongoDB:", err);
});

// Passport configuration
require("./config/passport")(passport);

// Routes
app.use("/auth", authRoutes);

app.post("/webhook", async (req, res) => {
  console.log(req.body.events[0].message.text);

  console.log(bot.conversationHistory);

  const response = await bot.sendMessage(req.body.events[0].message.text);

  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    {
      replyToken: req.body.events[0].replyToken,
      messages: [
        {
          type: "text",
          text: response.message || "Sorry, I did not understand that.",
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );

  res.json({
    status: "success",
    message: "Webhook received",
  });
});

app.post("/chat", async (req, res) => {
  try {
    // Get the message from the request body
    const message = req.body.message;

    if (!message) {
      return res.status(400).json({
        status: "error",
        message: "No message provided",
      });
    }

    // Send the message to the chatbot
    const response = await bot.sendMessage(message);

    // Return the bot's response
    res.json({
      status: "success",
      response: response.message || "Sorry, I did not understand that.",
    });
  } catch (error) {
    console.error("Error processing chat message:", error);
    res.status(500).json({
      status: "error",
      message: "An error occurred while processing your message",
    });
  }
});

// User registration route
app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error registering user", error });
  }
});

// User login route
app.post("/login", passport.authenticate("local"), (req, res) => {
  res.json({ message: "User logged in successfully" });
});

// Subscription management route
app.post("/subscribe", async (req, res) => {
  const { userId, paymentMethodId } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const customer = await stripe.customers.create({
      payment_method: paymentMethodId,
      email: user.email,
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ plan: process.env.STRIPE_PLAN_ID }],
      expand: ["latest_invoice.payment_intent"],
    });

    user.subscriptionStatus = "active";
    await user.save();

    res.json({ message: "Subscription successful", subscription });
  } catch (error) {
    res.status(500).json({ message: "Error processing subscription", error });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
