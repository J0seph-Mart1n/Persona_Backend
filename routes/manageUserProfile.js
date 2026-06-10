const UserProfile = require('../models/UserProfile');

// Hardcoded ID for the single-user system
const SINGLE_USER_ID = "main_user"; 

// =========================================================================
// ENDPOINT: Get Single User Profile
// =========================================================================
exports.getProfile = async (req, res) => {
    try {
        const profile = await UserProfile.findOne({ userId: SINGLE_USER_ID }).lean();

        if (!profile) {
            return res.status(404).json(null);
        }

        res.status(200).json(profile);
    } catch (error) {
        console.error("Error fetching profile:", error);
        res.status(500).json({ error: "Failed to fetch profile" });
    }
};

// =========================================================================
// ENDPOINT: Update Single User Profile (Merge/Upsert)
// =========================================================================
exports.updateProfile = async (req, res) => {
    const profileData = req.body;

    try {
        // Upsert ensures that the very first time you hit this endpoint, 
        // the "main_user" document is created automatically.
        const updatedProfile = await UserProfile.findOneAndUpdate(
            { userId: SINGLE_USER_ID },
            { $set: profileData }, 
            { 
                new: true,    
                upsert: true  
            }
        );

        res.status(200).json({ 
            message: "Profile updated successfully", 
            profile: updatedProfile 
        });
    } catch (error) {
        console.error("Error updating profile:", error);
        res.status(500).json({ error: "Failed to update profile" });
    }
};