const express = require('express');
const Chatbot = require('./utils/chatbot.js');
const axios = require('axios');
const dotenv = require('dotenv');
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

// Routes
app.post('/webhook', async (req, res) => {
    console.log(req.body.events[0].message.text);

    
    console.log(bot.conversationHistory);

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

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});