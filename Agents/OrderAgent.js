const { Pool } = require('pg');
const { ChatGoogleGenerativeAI } = require("langchain/chat_models/googlegenerativeai");
const { ChatPromptTemplate } = require('langchain/prompts');
const { StructuredOutputParser } = require('langchain/output_parsers');
const { RunnableSequence } = require('langchain/schema/runnable');

require('dotenv').config();

/**
 * AI Agent responsible for handling CRUD operations on Orders table
 * Integrates with LangChain to process natural language order-related requests
 */
class OrderAgent {
    /**
     * Create a new OrderAgent instance
     * @param {Object} config - Configuration options
     */
    constructor(config = {}) {
        this.dbConfig = config.dbConfig || {
            connectionString: process.env.DATABASE_URL
        };
        
        // Initialize PostgreSQL connection pool
        this.pool = new Pool(this.dbConfig);
        
        // Table name for orders
        this.tableName = config.tableName || 'orders';
        
        // Initialize LangChain components using Google Generative AI
        this.llm = new ChatGoogleGenerativeAI({
            temperature: 0.1,
            modelName: config.modelName || 'gemini-pro',
            apiKey: process.env.GOOGLE_API_KEY
        });
        
        // Setup the parser for structured outputs
        this.outputParser = StructuredOutputParser.fromNamesAndDescriptions({
            action: "The CRUD action to take (create, read, update, delete)",
            parameters: "Parameters needed for the action as a JSON object",
            explanation: "Explanation of what is being done"
        });
        
        // Initialize the prompt template
        this.promptTemplate = ChatPromptTemplate.fromTemplate(`
            You are an order management assistant. Parse the following request into a structured format.
            Request: {request}
            
            {format_instructions}
        `);
        
        // Create the LangChain processing chain
        this.chain = RunnableSequence.from([
            {
                request: input => input.request,
                format_instructions: () => this.outputParser.getFormatInstructions()
            },
            this.promptTemplate,
            this.llm,
            this.outputParser
        ]);
    }
    
    // [CRUD methods remain unchanged]
    async createOrder(orderData) {
        // Implementation remains the same
    }
    
    async getOrderById(orderId) {
        // Implementation remains the same
    }
    
    async updateOrder(orderId, updateData) {
        // Implementation remains the same
    }
    
    async deleteOrder(orderId) {
        // Implementation remains the same
    }
    
    /**
     * Process a natural language request related to orders
     * @param {string} request - The user's request in natural language
     * @param {Object} context - Additional context for processing
     * @returns {Object} Result of the operation
     */
    async processOrderRequest(request, context = {}) {
        try {
            // Process the request using the LangChain chain with Google's AI
            const result = await this.chain.invoke({ 
                request: request 
            });
            
            // Use the parsed result to determine which operation to perform
            const { action, parameters } = result;
            
            switch (action.toLowerCase()) {
                case 'create':
                    return await this.createOrder(parameters);
                    
                case 'read':
                    if (parameters.id) {
                        return await this.getOrderById(parameters.id);
                    }
                    // Could add more read operations here
                    
                case 'update':
                    if (parameters.id) {
                        const { id, ...updateData } = parameters;
                        return await this.updateOrder(id, updateData);
                    }
                    return { status: 'error', message: 'Order ID required for updates' };
                    
                case 'delete':
                    if (parameters.id) {
                        return await this.deleteOrder(parameters.id);
                    }
                    return { status: 'error', message: 'Order ID required for deletion' };
                    
                default:
                    return { status: 'error', message: 'Unknown action requested' };
            }
        } catch (error) {
            console.error('Error processing order request:', error);
            return { status: 'error', message: error.message };
        }
    }
    
    /**
     * Close the database connection
     */
    async close() {
        await this.pool.end();
    }
}

module.exports = OrderAgent;
