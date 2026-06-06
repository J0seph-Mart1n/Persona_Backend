const mongoose = require('mongoose');

const ChatSessionSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, index: true },
        title: { type: String, required: true },
        messages: { type: Array, default: [] },
    },
    { 
        timestamps: true // Automatically creates 'createdAt' and 'updatedAt'
    }
);

module.exports = mongoose.model('ChatSession', ChatSessionSchema);