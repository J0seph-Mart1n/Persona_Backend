const { extractProfileHeadless } = require('../scraper');

module.exports = (groq, hf, driver) => async (req, res) => {
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
        Also extract up to 3 major Domains (e.g., "Software Engineering", "Fitness", "Music") and specific Entities/Nodes within those domains (e.g., "React", "Marathon Running").
        
        Return ONLY valid JSON matching this schema:
        {
            "traits": [
                {
                    "name": "Trait Name",
                    "description": "Why they have this trait based strictly on the text.",
                    "strength": 0.85 
                }
            ],
            "domains": [
                {
                    "name": "Domain Name",
                    "relevance": 0.9,
                    "entities": [
                        {
                            "name": "Entity Name",
                            "description": "Context from profile",
                            "type": "Skill"
                        }
                    ]
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
        console.log("[VECTOR.OS] Generating embeddings for social traits and entities...");
        for (let trait of extractedData.traits) {
            const embeddingResponse = await hf.featureExtraction({
                model: "BAAI/bge-small-en-v1.5",
                inputs: trait.description,
            });
            trait.embedding = embeddingResponse;
        }

        const domains = extractedData.domains || [];
        for (let domain of domains) {
            for (let entity of domain.entities) {
                const embeddingResponse = await hf.featureExtraction({
                    model: "BAAI/bge-small-en-v1.5",
                    inputs: entity.description,
                });
                entity.embedding = embeddingResponse;
            }
        }

        // 4. Ingest into Neo4j with Data Provenance
        console.log("[VECTOR.OS] Mapping social traits, domains, and entities to Vector Space...");
        
        // Query 1: Traits
        const cypherQueryTraits = `
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

        await session.run(cypherQueryTraits, { 
            userId, 
            platform,
            profileUrl,
            traits: extractedData.traits 
        });

        // Query 2: Domains & Entities
        if (domains.length > 0) {
            const cypherQueryDomains = `
                MATCH (u:User {id: $userId})
                MATCH (s:DataSource {name: $platform, url: $profileUrl})
                
                WITH u, s
                UNWIND $domains AS domain
                MERGE (d:Domain {name: domain.name})
                MERGE (u)-[r1:ACTIVE_IN]->(d)
                SET r1.relevance = domain.relevance
                
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
            
            await session.run(cypherQueryDomains, { 
                userId, 
                platform,
                profileUrl,
                domains: domains
            });
        }

        res.status(200).json({ 
            message: "Headless social ingestion complete.",
            traitsExtracted: extractedData.traits.length,
            domainsExtracted: domains.length,
            traits: extractedData.traits,
            domains: domains 
        });

    } catch (error) {
        console.error("Ingestion Error:", error);
        res.status(500).json({ error: "Data pipeline failure during social extraction." });
    } finally {
        await session.close();
    }
};
