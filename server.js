const { extractProfileHeadless } = require('./scraper');

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Groq = require('groq-sdk');
const { InferenceClient } = require('@huggingface/inference');
const neo4j = require('neo4j-driver');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Groq (For Lightning-Fast LLM Extraction)
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Initialize HuggingFace (For Vector Embeddings)
const hf = new InferenceClient(process.env.HF_TOKEN);

// Initialize Neo4j Driver
const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USERNAME, process.env.NEO4J_PASSWORD)
);

const apiRoutes = require('./routes/api');

// Mount API routes
app.use('/api', apiRoutes(groq, hf, driver));

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
    console.log(`Vector.OS Backend running on port ${PORT} with Groq + HuggingFace!`);
});

// Graceful Shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down gracefully...');
    await driver.close();
    server.close(() => process.exit(0));
});