const axios = require('axios');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const mongoose = require('mongoose');

/**
 * AI Chatbot class for handling conversations with Google's Gemini model
 */
class Chatbot {
    /**
     * Create a new chatbot instance
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this.apiKey = config.apiKey || process.env.AI_API_KEY;
        this.model = config.model || 'gemini-2.0-flash';
        this.temperature = config.temperature || 0.7;
        this.maxTokens = config.maxTokens || 1000;
        this.maxHistoryLength = config.maxHistoryLength || 10;
        this.systemMessage = config.systemMessage || 'You are a helpful assistant.';
        this.genAI = new GoogleGenerativeAI(this.apiKey);
        this.AImodel = this.genAI.getGenerativeModel({ model: this.model});
        
        // Build complete API endpoint with API key
        this.apiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
        
        // Initialize with system message
        this.conversationHistory = [{ role: 'system', content: this.systemMessage }];
    }

    /**
     * Reset the conversation history with a system message
     * @param {string} systemMessage - Optional new system message
     */
    initialize(systemMessage = null) {
        if (systemMessage) this.systemMessage = systemMessage;
        this.conversationHistory = [{ role: 'system', content: this.systemMessage }];
        return this;
    }

    /**
     * Add a message to the conversation history
     * @param {string} role - The role ('user' or 'assistant')
     * @param {string} content - The message content
     */
    addMessage(role, content) {
        this.conversationHistory.push({ role, content });
        this._trimHistory();
        return this;
    }

    /**
     * Trim the conversation history to prevent it from growing too large
     */
    _trimHistory() {
        if (this.conversationHistory.length > this.maxHistoryLength + 1) {
            const systemMessages = this.conversationHistory.filter(msg => msg.role === 'system');
            const nonSystemMessages = this.conversationHistory
                .filter(msg => msg.role !== 'system')
                .slice(-(this.maxHistoryLength));
            
            this.conversationHistory = [...systemMessages, ...nonSystemMessages];
        }
    }

    /**
     * Get the current conversation history
     */
    getHistory() {
        return [...this.conversationHistory];
    }
    
    /**
     * Convert internal conversation history to Gemini API format
     * @returns {Array} Formatted contents for Gemini API
     */
    _formatConversationForGemini() {
        const contents = [];
        
        // Start with a system message if available
        const systemMessage = this.conversationHistory.find(msg => msg.role === 'system');
        if (systemMessage) {
            contents.push({
                role: "user",
                parts: [{ text: `System instruction: ${systemMessage.content}` }]
            });
        }
        
        // Add the conversation messages, pairing user and assistant messages
        const messages = this.conversationHistory.filter(msg => msg.role !== 'system');
        for (const message of messages) {
            contents.push({
                role: message.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: message.content }]
            });
        }
        
        return contents;
    }

    /**
     * Send a message to the AI and get a response
     * @param {string} message - The user message
     * @param {Object} options - Optional parameters to override defaults
     */
    async sendMessage(message, options = {}) {
        this.addMessage('user', message);

        try {
            // Add current message to conversation and format for Gemini
            const contents = this._formatConversationForGemini();
            
            // Send the request to the Gemini API
            const chatbot = this.AImodel.startChat({
                history: contents,
                generationConfig: {
                    maxOutputTokens: 1000,
                  },
            })


            const result = await chatbot.sendMessage(message);

            const response = await result.response;

            const text = response.text();

            // Extract the text from the response
            const assistantMessage = text;
            this.addMessage('assistant', assistantMessage);
            
            // Save chat summary to MongoDB
            await this.saveChatSummaryToMongoDB(message, assistantMessage);

            return {
                message: assistantMessage,
                status: 'success'
            };
        } catch (error) {
            console.error('Error communicating with Google AI service:', error);
            return {
                message: 'Sorry, I encountered an error while processing your request.',
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Save chat summary to MongoDB
     * @param {string} userMessage - The user's message
     * @param {string} assistantMessage - The assistant's response
     */
    async saveChatSummaryToMongoDB(userMessage, assistantMessage) {
        const ChatSummary = mongoose.model('ChatSummary', new mongoose.Schema({}, { strict: false }));
        const chatSummary = new ChatSummary({
            userMessage: userMessage,
            assistantMessage: assistantMessage,
            timestamp: new Date()
        });
        await chatSummary.save();
    }
}

module.exports = Chatbot;
