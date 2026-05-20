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

// =========================================================================
// ENDPOINT 1: Process the Assessment (Groq -> HuggingFace -> Neo4j)
// =========================================================================
app.post('/api/process-assessment', async (req, res) => {
    const { userId, mbtiVector, rawAnswers } = req.body;
    const session = driver.session();

    try {
        // 1. Get structured traits from Groq (Using LLaMA 3 70B)
        const prompt = `
        You are an expert behavioral psychologist. 
        A user has completed a personality assessment.
        Their baseline MBTI vector is [${mbtiVector}] [E/I, N/S, T/F, J/P].
        
        Based on their raw answers: ${JSON.stringify(rawAnswers)}
        Extract exactly 5 distinct behavioral traits for this user.
        
        Return ONLY valid JSON matching this exact schema:
        {
            "traits": [
                {
                    "name": "Abstract Thinker",
                    "description": "Prefers exploring unrealistic but intriguing concepts.",
                    "strength": 0.85
                }
            ]
        }`;

        console.log("Calling Groq API...");
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama3-70b-8192", // High-accuracy model available on Groq
            response_format: { type: "json_object" }, // Groq supports JSON mode!
            temperature: 0.2, // Low temperature for more deterministic output
        });

        const extractedData = JSON.parse(completion.choices[0].message.content);
        console.log("Groq Extraction Complete:", extractedData.traits);

        // 2. Generate Vector Embeddings using HuggingFace
        // Using 'bge-small-en-v1.5' - a highly rated, fast, open-source embedding model
        console.log("Generating Embeddings via HuggingFace...");
        for (let trait of extractedData.traits) {
            const embeddingResponse = await hf.featureExtraction({
                model: "BAAI/bge-small-en-v1.5",
                inputs: trait.description,
            });
            // HuggingFace returns a raw array of floats for feature extraction
            trait.embedding = embeddingResponse; 
        }

        // 3. Ingest into Neo4j
        console.log("Ingesting into Neo4j Graph...");
        const cypherQuery = `
            MERGE (u:User {id: $userId})
            SET u.mbti_vector = $mbtiVector
            
            WITH u
            UNWIND $traits AS trait
            MERGE (t:Trait {name: trait.name})
            SET t.description = trait.description,
                t.embedding = vector(trait.embedding, 384, 'FLOAT32')
            
            MERGE (u)-[r:EXHIBITS_TRAIT]->(t)
            SET r.strength = trait.strength
        `;

        await session.run(cypherQuery, { 
            userId, 
            mbtiVector, 
            traits: extractedData.traits 
        });

        res.status(200).json({ message: "Assessment processed via Groq and ingested to Neo4j successfully!" });

    } catch (error) {
        console.error("Error processing assessment:", error);
        res.status(500).json({ error: "Failed to process assessment" });
    } finally {
        await session.close();
    }
});

// =========================================================================
// ENDPOINT 2: Fetch Graph Data for Next.js Visualization
// =========================================================================
app.get('/api/graph/:userId', async (req, res) => {
    const { userId } = req.params;
    const session = driver.session();

    try {
        const result = await session.run(`
            MATCH (u:User {id: $userId})-[r:EXHIBITS_TRAIT]->(t:Trait)
            RETURN u.id AS userId, t.name AS traitName, r.strength AS strength
        `, { userId });

        const nodes = [{ id: userId, group: "User" }];
        const links = [];

        result.records.forEach(record => {
            const traitName = record.get('traitName');
            const strength = record.get('strength');
            
            nodes.push({ id: traitName, group: "Trait" });
            links.push({ source: userId, target: traitName, val: strength });
        });

        res.status(200).json({ nodes, links });

    } catch (error) {
        console.error("Error fetching graph:", error);
        res.status(500).json({ error: "Failed to fetch graph data" });
    } finally {
        await session.close();
    }
});

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