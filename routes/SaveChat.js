const ChatSession = require('../models/ChatSession'); // Adjust path as needed

// =========================================================================
// ENDPOINT: Create a New Chat Session
// =========================================================================
exports.createChatSession = async (req, res) => {
    const { userId, title, initialMessages = [] } = req.body;

    if (!userId || !title) {
        return res.status(400).json({ error: "Missing userId or title" });
    }

    try {
        const newSession = await ChatSession.create({
            userId,
            title,
            messages: initialMessages,
        });

        res.status(201).json({ 
            sessionId: newSession._id,
            message: "Chat session created successfully" 
        });
    } catch (error) {
        console.error("Error creating session:", error);
        res.status(500).json({ error: "Failed to create chat session" });
    }
};

// =========================================================================
// ENDPOINT: Get All Chat Sessions for a User
// =========================================================================
exports.getChatSessions = async (req, res) => {
    const { userId } = req.params;

    try {
        // Find sessions, sort by newest first, and exclude the giant messages array to save bandwidth
        const sessions = await ChatSession.find({ userId })
            .select('-messages') // Do not return messages here, just metadata
            .sort({ updatedAt: -1 })
            .lean();

        res.status(200).json({ sessions });
    } catch (error) {
        console.error("Error fetching sessions:", error);
        res.status(500).json({ error: "Failed to fetch chat sessions" });
    }
};

// =========================================================================
// ENDPOINT: Get Messages for a Specific Session
// =========================================================================
exports.getSessionMessages = async (req, res) => {
    const { userId, sessionId } = req.params;

    try {
        const session = await ChatSession.findOne(
            { _id: sessionId, userId: userId },
            'messages' // Only fetch the messages array
        ).lean();

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        res.status(200).json({ messages: session.messages });
    } catch (error) {
        console.error("Error fetching session messages:", error);
        res.status(500).json({ error: "Failed to fetch session messages" });
    }
};