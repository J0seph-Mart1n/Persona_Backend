const ChatSession = require('../models/ChatSession');

module.exports = (ollama, driver) => async (req, res) => {
    const { userId, message, history = [], sessionId } = req.body;
    
    if (!userId || !message) {
        return res.status(400).json({ error: "Missing userId or message" });
    }

    const session = driver && typeof driver.session === 'function' ? driver.session() : null;

    try {
        // 1. Fetch user's traits and domains from Neo4j
        const traitResult = await session.run(`
            MATCH (u:User {id: $userId})-[r:EXHIBITS_TRAIT]->(t:Trait)
            RETURN t.name AS name, t.description AS description, r.strength AS strength
        `, { userId });

        const domainResult = await session.run(`
            MATCH (u:User {id: $userId})-[:ACTIVE_IN]->(d:Domain)<-[:BELONGS_TO]-(e:Entity)<-[:ASSOCIATED_WITH]-(u)
            RETURN d.name AS domain, collect({name: e.name, description: e.description, type: e.type}) AS entities
        `, { userId });

        let userContext = "No specific traits found.";
        if (traitResult.records.length > 0) {
            const traits = traitResult.records.map(record => {
                return `- ${record.get('name')} (Strength: ${record.get('strength')}): ${record.get('description')}`;
            });
            userContext = "Traits:\n" + traits.join('\n');
        }

        if (domainResult.records.length > 0) {
            const domains = domainResult.records.map(record => {
                const domainName = record.get('domain');
                const entities = record.get('entities').map(e => `  * ${e.name} (${e.type}): ${e.description}`).join('\n');
                return `- Domain: ${domainName}\n${entities}`;
            });
            userContext += "\n\nDomains & Interests:\n" + domains.join('\n');
        }

        // 2. Construct System Prompt
        const systemPrompt = `
            You are Persona, a highly advanced, perceptive, and personalized AI assistant.
            You have access to the user's psychological profile, domains of interest, and specific skills mapped in a vector graph.

            User's Detected Profile:
            ${userContext}

            Use this information to implicitly understand the user and tailor your responses. 
            Do not explicitly say "Based on your traits...", but let your tone, advice, and analysis reflect their personality and domains of expertise.
            Keep your responses concise, intelligent, and slightly cyberpunk/analytical in tone, fitting the 'Vector.OS' persona.
        `;

        // 3. Construct messages array for Ollama
        const messages = [
            { role: "system", content: systemPrompt },
            ...history,
            { role: "user", content: message }
        ];

        // 4. Call Ollama
        console.log("Calling Ollama for chat completion...");
        const completion = await ollama.chat({
            model: process.env.LOCAL_LLM_MODEL,
            messages: messages,
            options: {
                temperature: 0.7, // Higher temperature for chat
            }
        });

        const aiResponse = completion.message.content;

        if (sessionId) {
            const newMessagesToSave = [
                { role: "user", content: message, timestamp: new Date() },
                { role: "assistant", content: aiResponse, timestamp: new Date() }
            ];

            // $push with $each efficiently appends the two new messages to the array
            await ChatSession.findOneAndUpdate(
                { _id: sessionId, userId: userId },
                { $push: { messages: { $each: newMessagesToSave } } },
                { new: true }
            );
        }

        res.status(200).json({ response: aiResponse });

    } catch (error) {
        console.error("Error in chat endpoint:", error);
        res.status(500).json({ error: "Failed to process chat message" });
    } finally {
        if (typeof session !== 'undefined' && session) {
            await session.close();
        }
    }
};
