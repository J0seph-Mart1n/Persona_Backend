module.exports = (groq, hf, driver) => async (req, res) => {
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
};
