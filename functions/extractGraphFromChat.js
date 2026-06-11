// =============================================================================
// BACKGROUND: Extract traits, domains & entities from a chat exchange
// =============================================================================
async function extractGraphFromChat(ollama, driver, userId, userMessage, aiResponse) {
    const extractionPrompt = `
        You are an expert behavioral analyst for VECTOR.OS.
        Your job is to determine if a chat exchange reveals meaningful personality traits, 
        interest domains, or specific entities (skills, tools, topics) about the USER.

        User's message: "${userMessage}"
        AI's response: "${aiResponse}"

        IMPORTANT RULES — follow these IN ORDER:
        1. FIRST, check if the user's message is substantive. If the user's message is a 
           greeting, small talk, short generic reply (e.g. "Hi", "Hello", "Thanks", "Ok", 
           "Yes", "No", "How are you?", "What can you do?"), then ALWAYS return 
           extractable: false — regardless of how detailed the AI response is.
        2. ONLY if the user's message contains real substance (mentions of skills, projects, 
           interests, opinions, expertise, goals, or personal information), then analyze 
           BOTH the user's message AND the AI's response for traits about the user.
        3. Extract traits that describe the USER's personality, behavior, or tendencies — 
           not general knowledge the AI shared.
        4. Extract domains and entities that represent the USER's areas of interest or skill.

        Return ONLY valid JSON matching this exact schema:
        {
            "extractable": false,
            "traits": [],
            "domains": []
        }

        When extractable is true, populate the arrays:
        {
            "extractable": true,
            "traits": [
                {
                    "name": "Trait Name",
                    "description": "Evidence from the user's message supporting this trait.",
                    "strength": 0.7
                }
            ],
            "domains": [
                {
                    "name": "Domain Name",
                    "relevance": 0.8,
                    "entities": [
                        {
                            "name": "Entity Name",
                            "description": "Context from the user's message.",
                            "type": "Skill"
                        }
                    ]
                }
            ]
        }`;

    console.log("[VECTOR.OS] Running background graph extraction on chat exchange...");

    const extraction = await ollama.chat({
        model: process.env.LOCAL_LLM_MODEL,
        messages: [{ role: "user", content: extractionPrompt }],
        format: "json",
        options: {
            temperature: 0.2, // Low temperature for structured extraction
        }
    });

    let extractedData;
    try {
        extractedData = JSON.parse(extraction.message.content);
    } catch (parseErr) {
        console.log("[VECTOR.OS] Extraction returned non-JSON, skipping.");
        return;
    }

    if (!extractedData.extractable) {
        console.log("[VECTOR.OS] No extractable graph data in this exchange. Skipping.");
        return;
    }

    console.log("[VECTOR.OS] Extractable data found! Traits:", 
        (extractedData.traits || []).length, 
        "| Domains:", (extractedData.domains || []).length
    );

    // Open a dedicated Neo4j session for background work
    const bgSession = driver && typeof driver.session === 'function' ? driver.session() : null;
    if (!bgSession) {
        console.log("[VECTOR.OS] No Neo4j driver available, skipping graph ingestion.");
        return;
    }

    try {
        const traits = extractedData.traits || [];
        const domains = extractedData.domains || [];

        // Generate embeddings for traits
        for (let trait of traits) {
            const embeddingResponse = await ollama.embeddings({
                model: process.env.LOCAL_EMBEDDING_MODEL || "nomic-embed-text",
                prompt: trait.description,
            });
            trait.embedding = embeddingResponse.embedding;
        }

        // Generate embeddings for domain entities
        for (let domain of domains) {
            for (let entity of (domain.entities || [])) {
                const embeddingResponse = await ollama.embeddings({
                    model: process.env.LOCAL_EMBEDDING_MODEL || "nomic-embed-text",
                    prompt: entity.description,
                });
                entity.embedding = embeddingResponse.embedding;
            }
        }

        // Ingest traits into Neo4j — keep the higher strength if the trait already exists
        if (traits.length > 0) {
            const cypherTraits = `
                MERGE (u:User {id: $userId})
                
                MERGE (s:DataSource {name: 'Chat'})
                MERGE (u)-[:CONNECTED_TO]->(s)
                
                WITH u, s
                UNWIND $traits AS trait
                MERGE (t:Trait {name: trait.name})
                SET t.description = trait.description
                
                WITH u, s, t, trait
                CALL db.create.setNodeVectorProperty(t, 'embedding', trait.embedding)
                
                MERGE (u)-[r:EXHIBITS_TRAIT]->(t)
                SET r.strength = CASE 
                    WHEN r.strength IS NOT NULL AND r.strength > trait.strength THEN r.strength 
                    ELSE trait.strength 
                END
                
                MERGE (t)-[:EXTRACTED_FROM]->(s)
            `;

            await bgSession.run(cypherTraits, { userId, traits });
            console.log(`[VECTOR.OS] ✅ Ingested ${traits.length} trait(s) from chat into Neo4j.`);
        }

        // Ingest domains & entities into Neo4j
        if (domains.length > 0) {
            const cypherDomains = `
                MATCH (u:User {id: $userId})
                MATCH (s:DataSource {name: 'Chat'})
                
                WITH u, s
                UNWIND $domains AS domain
                MERGE (d:Domain {name: domain.name})
                MERGE (u)-[r1:ACTIVE_IN]->(d)
                SET r1.relevance = CASE 
                    WHEN r1.relevance IS NOT NULL AND r1.relevance > domain.relevance THEN r1.relevance 
                    ELSE domain.relevance 
                END
                
                WITH u, s, d, domain
                UNWIND domain.entities AS entity
                MERGE (e:Entity {name: entity.name})
                SET e.description = entity.description, e.type = entity.type
                
                WITH u, s, d, e, entity
                CALL db.create.setNodeVectorProperty(e, 'embedding', entity.embedding)
                
                MERGE (u)-[r2:ASSOCIATED_WITH]->(e)
                SET r2.type = entity.type
                
                MERGE (e)-[:BELONGS_TO]->(d)
                MERGE (e)-[:EXTRACTED_FROM]->(s)
            `;

            await bgSession.run(cypherDomains, { userId, domains });
            console.log(`[VECTOR.OS] ✅ Ingested ${domains.length} domain(s) from chat into Neo4j.`);
        }

    } finally {
        await bgSession.close();
    }
}

module.exports = extractGraphFromChat;
