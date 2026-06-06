module.exports = (ollama, driver) => async (req, res) => {
    const { userId, mbtiVector, rawAnswers } = req.body;
    const session = driver && typeof driver.session === 'function' ? driver.session() : null;

    try {
        // 1. Get structured traits from Groq (Using LLaMA 3 70B)
        const prompt = `
        You are an expert behavioral psychologist. 
        A user has completed a personality assessment.
        Their baseline MBTI vector is [${mbtiVector}] [E/I, N/S, T/F, J/P].
        
        Based on their detailed answers to these statements: ${JSON.stringify(rawAnswers)}
        Extract behavioral traits for this user.
        
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

        console.log("Calling Ollama for extraction...");
        const completion = await ollama.chat({
            model: process.env.LOCAL_LLM_MODEL, // High-accuracy model available on Groq
            messages: [{ role: "user", content: prompt }],
            format: "json", // Ollama supports JSON mode!
            options: {
                temperature: 0.2, // Low temperature for more deterministic output
            }
        });

        const extractedData = JSON.parse(completion.message.content);
        console.log("Groq Extraction Complete:", extractedData.traits);

        // 2. Generate Vector Embeddings using HuggingFace
        // Using 'bge-small-en-v1.5' - a highly rated, fast, open-source embedding model
        console.log("Generating Embeddings via Ollama...");
        for (let trait of extractedData.traits) {
            const embeddingResponse = await ollama.embeddings({
                model: process.env.LOCAL_EMBEDDING_MODEL || "nomic-embed-text", // Local embedding model
                prompt: trait.description,
            });
            // Ollama returns the vector array inside the `embedding` property
            trait.embedding = embeddingResponse.embedding; 
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

        if (session) {
            await session.run(cypherQuery, { 
                userId, 
                mbtiVector, 
                traits: extractedData.traits 
            });
        }

        res.status(200).json({ message: "Assessment processed via Groq and ingested to Neo4j successfully!" });

    } catch (error) {
        console.error("Error processing assessment:", error);
        res.status(500).json({ error: "Failed to process assessment" });
    } finally {
        if (typeof session !== 'undefined' && session) {
            await session.close();
        }
    }
};
