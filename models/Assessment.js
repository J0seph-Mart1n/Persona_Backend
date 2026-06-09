const mongoose = require('mongoose');

const AssessmentSchema = new mongoose.Schema(
    {
        userId: { type: String, required: true, index: true, unique: true }, // unique ensures 1 per user
        mbtiVector: { type: String, required: true },
        detailedAnswers: { type: Array, default: [] },
    },
    { 
        timestamps: true // Automatically manages createdAt and updatedAt
    }
);

module.exports = mongoose.model('Assessment', AssessmentSchema);