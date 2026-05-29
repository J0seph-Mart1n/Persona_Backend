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
        
        Based on their detailed answers to these statements: ${JSON.stringify(rawAnswers)}
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
            model: "llama-3.3-70b-versatile", // High-accuracy model available on Groq
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
            SET t.description = trait.description
            
            WITH u, t, trait
            CALL db.create.setNodeVectorProperty(t, 'embedding', trait.embedding)
            
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
// =========================================================================
// ENDPOINT 3: Personalized Chat Assistant (LLM + Vector Graph Context)
// =========================================================================
app.post('/api/chat', async (req, res) => {
    const { userId, message, history = [] } = req.body;
    
    if (!userId || !message) {
        return res.status(400).json({ error: "Missing userId or message" });
    }

    const session = driver.session();

    try {
        // 1. Fetch user's traits from Neo4j
        const result = await session.run(`
            MATCH (u:User {id: $userId})-[r:EXHIBITS_TRAIT]->(t:Trait)
            RETURN t.name AS name, t.description AS description, r.strength AS strength
        `, { userId });

        let userContext = "No specific traits found.";
        if (result.records.length > 0) {
            const traits = result.records.map(record => {
                return `- ${record.get('name')} (Strength: ${record.get('strength')}): ${record.get('description')}`;
            });
            userContext = traits.join('\n');
        }

        // 2. Construct System Prompt
        const systemPrompt = `
            You are Persona, a highly advanced, perceptive, and personalized AI assistant.
            You have access to the user's psychological profile and behavioral traits mapped in a vector graph.

            User's Detected Traits:
            ${userContext}

            Use this information to implicitly understand the user and tailor your responses. 
            Do not explicitly say "Based on your traits...", but let your tone, advice, and analysis reflect their personality (e.g., if they are abstract thinkers, use metaphors; if they are highly structured, use clear steps).
            Keep your responses concise, intelligent, and slightly cyberpunk/analytical in tone, fitting the 'Vector.OS' persona.
        `;

        // 3. Construct messages array for Groq
        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message }
        ];

        // 4. Call Groq API
        console.log("Calling Groq for chat completion...");
        const completion = await groq.chat.completions.create({
            messages: messages,
            model: "llama-3.3-70b-versatile",
            temperature: 0.7, // Higher temperature for chat
        });

        const aiResponse = completion.choices[0].message.content;

        res.status(200).json({ response: aiResponse });

    } catch (error) {
        console.error("Error in chat endpoint:", error);
        res.status(500).json({ error: "Failed to process chat message" });
    } finally {
        await session.close();
    }
});

// =========================================================================
// ENDPOINT 4: Headless Social Profile Extraction & Ingestion
// =========================================================================
app.post('/api/ingest/social', async (req, res) => {
    const { userId, platform, profileUrl } = req.body;
    
    if (!userId || !platform || !profileUrl) {
        return res.status(400).json({ error: "Missing userId, platform, or profileUrl" });
    }

    const session = driver.session();

    try {
        // 1. Headless Extraction via Playwright
        console.log(`[VECTOR.OS] Triggering headless extraction for ${platform}...`);
        const rawProfileText = await extractProfileHeadless(profileUrl, platform);

        if (!rawProfileText || rawProfileText.trim() === "") {
            return res.status(400).json({ error: "Could not extract sufficient profile data." });
        }

        console.log(rawProfileText)

        // 2. LLM Trait Extraction via Groq
        console.log("[VECTOR.OS] Pushing scraped text to Groq LLM...");
        const prompt = `
        You are an expert behavioral analyst system for VECTOR.OS.
        I have scraped text strictly from a user's ${platform} profile. 
        
        Raw Profile Text: 
        """
        ${rawProfileText.substring(0, 6000)}
        """
        
        Ignore UI artifacts (like "Retweets", "Followers", "Menu", "Login").
        Focus on what the user says about themselves, their work history, projects, tone, and interests.
        Extract 3 to 5 psychological or professional traits.
        
        Return ONLY valid JSON matching this schema:
        {
            "traits": [
                {
                    "name": "Trait Name",
                    "description": "Why they have this trait based strictly on the text.",
                    "strength": 0.85 
                }
            ]
        }`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" },
            temperature: 0.1, 
        });

        const extractedData = JSON.parse(completion.choices[0].message.content);

        // 3. Generate HuggingFace Embeddings
        console.log("[VECTOR.OS] Generating embeddings for social traits...");
        for (let trait of extractedData.traits) {
            const embeddingResponse = await hf.featureExtraction({
                model: "BAAI/bge-small-en-v1.5",
                inputs: trait.description,
            });
            trait.embedding = embeddingResponse;
        }

        // 4. Ingest into Neo4j with Data Provenance
        console.log("[VECTOR.OS] Mapping social traits to Vector Space...");
        const cypherQuery = `
            MERGE (u:User {id: $userId})
            MERGE (s:DataSource {name: $platform, url: $profileUrl})
            MERGE (u)-[:CONNECTED_TO]->(s)
            
            WITH u, s
            UNWIND $traits AS trait
            MERGE (t:Trait {name: trait.name})
            SET t.description = trait.description
            
            WITH u, s, t, trait
            CALL db.create.setNodeVectorProperty(t, 'embedding', trait.embedding)
            
            MERGE (u)-[r:EXHIBITS_TRAIT]->(t)
            SET r.strength = trait.strength
            
            MERGE (t)-[:EXTRACTED_FROM]->(s)
        `;

        await session.run(cypherQuery, { 
            userId, 
            platform,
            profileUrl,
            traits: extractedData.traits 
        });

        res.status(200).json({ 
            message: "Headless social ingestion complete.",
            traitsExtracted: extractedData.traits.length,
            traits: extractedData.traits 
        });

    } catch (error) {
        console.error("Ingestion Error:", error);
        res.status(500).json({ error: "Data pipeline failure during social extraction." });
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