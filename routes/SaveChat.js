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
        // Find sessions, sort by newest first
        const sessions = await ChatSession.find({ userId })
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

// =========================================================================
// ENDPOINT: Save Message to Session
// =========================================================================
exports.saveMessageToSession = async (req, res) => {
    const { userId, sessionId } = req.params;
    const { messages = [] } = req.body;

    if (!messages || messages.length === 0) {
        return res.status(400).json({ error: "Missing messages to save" });
    }

    try {
        const session = await ChatSession.findOneAndUpdate(
            { _id: sessionId, userId: userId },
            { $push: { messages: { $each: messages } } },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ error: "Session not found" });
        }

        res.status(200).json({ message: "Messages saved successfully" });
    } catch (error) {
        console.error("Error saving messages to session:", error);
        res.status(500).json({ error: "Failed to save messages" });
    }
};