require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Ollama } = require('ollama'); // Official Ollama SDK
const neo4j = require('neo4j-driver');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Local Ollama Client (Handles BOTH Chat & Embeddings)
const ollama = new Ollama({ 
    host: process.env.OLLAMA_HOST || 'http://127.0.0.1:11434' 
});

// Initialize Local Neo4j Driver
const driver = neo4j.driver(
    process.env.NEO4J_URI || 'neo4j://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USERNAME || 'neo4j', process.env.NEO4J_PASSWORD)
);


const apiRoutes = require('./routes/api');

// Mount API routes
app.use('/api', apiRoutes(ollama, driver));

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