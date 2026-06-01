const { PDFParse } = require('pdf-parse');

module.exports = (groq, hf, driver) => async (req, res) => {
    const { userId } = req.body;
    
    if (!userId || !req.file) {
        return res.status(400).json({ error: "Missing userId or resume file." });
    }

    const session = driver.session();

    try {
        console.log(`[VECTOR.OS] Parsing uploaded resume for user: ${userId}...`);
        
        // 1. Extract raw text from the PDF buffer
        const parser = new PDFParse({ data: req.file.buffer });
        const pdfData = await parser.getText();
        const rawResumeText = pdfData.text;

        if (!rawResumeText || rawResumeText.trim() === "") {
            return res.status(400).json({ error: "Could not extract text from the provided PDF." });
        }

        console.log(`[VECTOR.OS] Extracted ${rawResumeText.length} characters from resume.`);

        // 2. LLM Trait Extraction via Groq
        console.log("[VECTOR.OS] Pushing resume text to Groq LLM...");
        const prompt = `
        You are an expert professional profiler and behavioral analyst for VECTOR.OS.
        I have extracted the raw text from a user's resume.
        
        Raw Resume Text: 
        """
        ${rawResumeText.substring(0, 6000)} // Truncating to avoid token limits
        """
        
        Analyze their career trajectory, skills, action verbs, and accomplishments.
        Extract deep professional/psychological traits (e.g., "Strategic Leader", "Hyper-Focused Executor", "Adaptable Generalist").
        Also extract major Domains (e.g., "Software Engineering", "Product Management") and specific Entities/Nodes within those domains (e.g., "React", "Machine Learning").
        
        Return ONLY valid JSON matching this schema:
        {
            "traits": [
                {
                    "name": "Trait Name",
                    "description": "Why they possess this trait based on specific resume evidence.",
                    "strength": 0.90 
                }
            ],
            "domains": [
                {
                    "name": "Domain Name",
                    "relevance": 0.9,
                    "entities": [
                        {
                            "name": "Entity Name",
                            "description": "Context from resume",
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
        console.log("[VECTOR.OS] Generating embeddings for professional traits and entities...");
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

        // 4. Ingest into Neo4j with Data Provenance ("Resume")
        console.log("[VECTOR.OS] Mapping resume traits, domains, and entities to Vector Space...");
        
        const cypherQueryTraits = `
            MERGE (u:User {id: $userId})
            
            // Note: We flag this DataSource as a static 'Resume' document
            MERGE (s:DataSource {name: 'Resume', filename: $filename})
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
            filename: req.file.originalname,
            traits: extractedData.traits 
        });

        if (domains.length > 0) {
            const cypherQueryDomains = `
                MATCH (u:User {id: $userId})
                MATCH (s:DataSource {name: 'Resume', filename: $filename})
                
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
                filename: req.file.originalname,
                domains: domains
            });
        }

        res.status(200).json({ 
            message: "Resume ingestion complete.",
            traitsExtracted: extractedData.traits.length,
            domainsExtracted: domains.length,
            traits: extractedData.traits,
            domains: domains 
        });

    } catch (error) {
        console.error("Resume Ingestion Error:", error);
        res.status(500).json({ error: "Failed to parse and ingest resume." });
    } finally {
        await session.close();
    }
}