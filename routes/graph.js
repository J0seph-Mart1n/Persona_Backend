module.exports = (ollama, driver) => async (req, res) => {
    const { userId } = req.params;
    const session = driver && typeof driver.session === 'function' ? driver.session() : null;

    try {
        const nodesMap = new Map();
        nodesMap.set(userId, { id: userId, group: "User" });
        const links = [];

        if (session) {
            // 1. Fetch Traits
            const traitResult = await session.run(`
                MATCH (u:User {id: $userId})-[r:EXHIBITS_TRAIT]->(t:Trait)
                RETURN t.name AS name, r.strength AS weight
            `, { userId });
            traitResult.records.forEach(record => {
                const name = record.get('name');
                nodesMap.set(name, { id: name, group: "Trait" });
                links.push({ source: userId, target: name, val: record.get('weight') || 1 });
            });

            // 2. Fetch Domains
            const domainResult = await session.run(`
                MATCH (u:User {id: $userId})-[r:ACTIVE_IN]->(d:Domain)
                RETURN d.name AS name, r.relevance AS weight
            `, { userId });
            domainResult.records.forEach(record => {
                const name = record.get('name');
                nodesMap.set(name, { id: name, group: "Domain" });
                links.push({ source: userId, target: name, val: record.get('weight') || 1 });
            });

            // 3. Fetch Entities and link them to Domains
            const entityDomainResult = await session.run(`
                MATCH (u:User {id: $userId})-[:ASSOCIATED_WITH]->(e:Entity)-[:BELONGS_TO]->(d:Domain)
                RETURN e.name AS entityName, d.name AS domainName
            `, { userId });
            entityDomainResult.records.forEach(record => {
                const entityName = record.get('entityName');
                const domainName = record.get('domainName');
                nodesMap.set(entityName, { id: entityName, group: "Entity" });
                links.push({ source: entityName, target: domainName, val: 1 });
                // Also implicitly link to user
                links.push({ source: userId, target: entityName, val: 0.5 });
            });
        }

        const nodes = Array.from(nodesMap.values());
        res.status(200).json({ nodes, links });

    } catch (error) {
        console.error("Error fetching graph data:", error);
        res.status(500).json({ error: "Failed to fetch graph data" });
    } finally {
        if (typeof session !== 'undefined' && session) {
            await session.close();
        }
    }
};
