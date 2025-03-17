const express = require('express');
const Chatbot = require('./utils/chatbot.js');
const axios = require('axios');
const dotenv = require('dotenv');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const session = require('express-session');
const mongoose = require('mongoose');
const ejs = require('ejs');
dotenv.config();

let config = {
    apiKey: process.env.AI_API_KEY || "AIzaSyBYa0jrExkq70JnZYEPGtc5byT3w3SFwpY",
    model: 'gemini-2.0-flash',
    temperature: 0.7,
    maxTokens: 1000,
    maxHistoryLength: 10,
    systemMessage: 'You are a helpful assistant.'
}

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
    saveUninitialized: true,
    cookie: { maxAge: 60000 }
}));
app.set('view engine', 'ejs');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

// Define User schema
const userSchema = new mongoose.Schema({
    email: String,
    stripeCustomerId: String,
    subscriptionStatus: String,
    trialEndDate: Date,
    lineChannelAccessToken: String,
    chatHistory: Array
});

const User = mongoose.model('User', userSchema);

// Routes
app.post('/webhook', async (req, res) => {
    console.log(req.body.events[0].message.text);

    const response = await bot.sendMessage(req.body.events[0].message.text);

    await axios.post("https://api.line.me/v2/bot/message/reply", {
        replyToken: req.body.events[0].replyToken,
        messages: [
            {
                type: 'text',
                text: response.message || 'Sorry, I did not understand that.'
            }
        ]
    }, {
        headers: {
            'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });

    res.json({
        status: 'success',
        message: 'Webhook received'
    });
});

app.post('/subscribe', async (req, res) => {
    const { email, paymentMethodId } = req.body;

    try {
        // Create a new customer
        const customer = await stripe.customers.create({
            email: email,
            payment_method: paymentMethodId,
            invoice_settings: {
                default_payment_method: paymentMethodId,
            },
        });

        // Create a subscription
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: process.env.STRIPE_PRICE_ID }],
            trial_period_days: 7,
        });

        // Save user to database
        const user = new User({
            email: email,
            stripeCustomerId: customer.id,
            subscriptionStatus: subscription.status,
            trialEndDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 1 week from now
        });

        await user.save();

        res.json({
            status: 'success',
            message: 'Subscription created successfully',
            subscriptionId: subscription.id
        });
    } catch (error) {
        console.error('Error creating subscription:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to create subscription',
            error: error.message
        });
    }
});

app.post('/set-line-token', async (req, res) => {
    const { email, lineChannelAccessToken } = req.body;

    try {
        const user = await User.findOne({ email: email });

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        user.lineChannelAccessToken = lineChannelAccessToken;
        await user.save();

        res.json({
            status: 'success',
            message: 'LINE Channel Access Token updated successfully'
        });
    } catch (error) {
        console.error('Error updating LINE Channel Access Token:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update LINE Channel Access Token',
            error: error.message
        });
    }
});

app.get('/admin', async (req, res) => {
    try {
        const users = await User.find();
        res.render('admin', { users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch users',
            error: error.message
        });
    }
});

app.post('/admin/add-subscription', async (req, res) => {
    const { email, subscriptionStatus } = req.body;

    try {
        const user = await User.findOne({ email: email });

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        user.subscriptionStatus = subscriptionStatus;
        await user.save();

        res.json({
            status: 'success',
            message: 'Subscription status updated successfully'
        });
    } catch (error) {
        console.error('Error updating subscription status:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update subscription status',
            error: error.message
        });
    }
});

app.post('/confirm-order', async (req, res) => {
    const { email, orderId } = req.body;

    try {
        const user = await User.findOne({ email: email });

        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found'
            });
        }

        // Call AI agent to store chat summary
        const chatSummary = await bot.sendMessage(`Order ${orderId} confirmed. Please summarize the chat.`);
        user.chatHistory.push({ orderId, summary: chatSummary.message });
        await user.save();

        res.json({
            status: 'success',
            message: 'Order confirmed and chat summary stored successfully'
        });
    } catch (error) {
        console.error('Error confirming order:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to confirm order',
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
