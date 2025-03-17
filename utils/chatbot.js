const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
const { PostgresChatMessageHistory } = require("@langchain/community/stores/message/postgres");
const { ConversationChain } = require("langchain/chains");
const { BufferMemory } = require("langchain/memory");
const { ChatPromptTemplate, MessagesPlaceholder } = require("@langchain/core/prompts");

require('dotenv').config();

/**
 * AI Chatbot class using LangChain and PostgreSQL memory
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
        this.sessionId = config.sessionId || `session_${Date.now()}`;
        
        // Database configuration for PostgreSQL
        this.dbConfig = config.dbConfig || {
            connectionString: process.env.DATABASE_URL,
            tableName: 'chat_messages'
        };
        
        // Initialize LangChain components
        this._setupLangChainComponents();
    }

    /**
     * Setup LangChain model, memory, and chain
     * @private
     */
    _setupLangChainComponents() {
        console.log(this.dbConfig)

        // Initialize the model
        this.llm = new ChatGoogleGenerativeAI({
            apiKey: this.apiKey,
            modelName: this.model,
            temperature: this.temperature,
            maxOutputTokens: this.maxTokens,
        });
        
        // Initialize PostgreSQL chat history
        this.messageHistory = new PostgresChatMessageHistory({
            sessionId: this.sessionId,
            poolConfig: this.dbConfig
        });
        
        // Create memory using the PostgreSQL history
        this.memory = new BufferMemory({
            chatHistory: this.messageHistory,
            returnMessages: true,
            memoryKey: "history",
            inputKey: "input",
        });

        // Create a chat prompt template
        const prompt = ChatPromptTemplate.fromMessages([
            ["system", this.systemMessage],
            new MessagesPlaceholder("history"),
            ["human", "{input}"]
        ]);
        
        // Create the conversation chain
        this.chain = new ConversationChain({
            llm: this.llm,
            memory: this.memory,
            prompt,
        });
    }

    /**
     * Reset the conversation history with a system message
     * @param {string} systemMessage - Optional new system message
     */
    async initialize(systemMessage = null) {
        if (systemMessage) {
            this.systemMessage = systemMessage;
            this._setupLangChainComponents();
        }
        
        await this.messageHistory.clear();
        return this;
    }

    /**
     * Add a message to the conversation history
     * @param {string} role - The role ('user' or 'assistant')
     * @param {string} content - The message content
     */
    async addMessage(role, content) {
        if (role === 'user') {
            await this.messageHistory.addUserMessage(content);
        } else if (role === 'assistant') {
            await this.messageHistory.addAIMessage(content);
        } else if (role === 'system') {
            this.systemMessage = content;
            this._setupLangChainComponents();
        }
        return this;
    }

    /**
     * Get the current conversation history
     */
    async getHistory() {
        const messages = await this.messageHistory.getMessages();
        return messages.map(msg => ({
            role: msg._getType() === 'human' ? 'user' : 'assistant',
            content: msg.content
        }));
    }

    /**
     * Send a message to the AI and get a response
     * @param {string} message - The user message
     */
    async sendMessage(message) {
        try {
            const response = await this.chain.invoke({ input: message });
 
            
            return {
                message: response.response,
                status: 'success'
            };
        } catch (error) {
            console.error('Error communicating with LLM service:', error);
            return {
                message: 'Sorry, I encountered an error while processing your request.',
                status: 'error',
                error: error.message
            };
        }
    }
}

module.exports = Chatbot;
