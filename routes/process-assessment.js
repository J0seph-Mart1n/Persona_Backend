module.exports = (groq, hf, driver) => async (req, res) => {
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
};
