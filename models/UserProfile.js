const mongoose = require('mongoose');

const UserProfileSchema = new mongoose.Schema(
    {
        // We keep this to ensure Mongoose updates the exact same document every time
        userId: { type: String, required: true, unique: true, default: "main_user" },
        bio: { type: String, default: "" },
    },
    { 
        timestamps: true 
    }
);

module.exports = mongoose.model('UserProfile', UserProfileSchema);