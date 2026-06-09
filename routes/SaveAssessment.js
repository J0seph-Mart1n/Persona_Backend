const Assessment = require('../models/Assessment');

// =========================================================================
// ENDPOINT: Save/Update Assessment (Upsert)
// =========================================================================
exports.saveAssessmentHandler = async (req, res) => {
    const { userId, mbtiVector, detailedAnswers } = req.body;

    if (!userId || !mbtiVector) {
        return res.status(400).json({ error: "Missing userId or mbtiVector" });
    }

    try {
        // findOneAndUpdate with { upsert: true } will:
        // 1. Look for an existing assessment for this user
        // 2. If it exists, overwrite it
        // 3. If it doesn't exist, create a new one
        const updatedAssessment = await Assessment.findOneAndUpdate(
            { userId: userId }, // Search criteria
            { 
                mbtiVector: mbtiVector,
                detailedAnswers: detailedAnswers
            }, 
            { 
                new: true,   // Return the updated document
                upsert: true // Create if it doesn't exist
            }
        );

        res.status(200).json({ 
            message: "Assessment successfully saved to MongoDB.",
            assessment: updatedAssessment 
        });
    } catch (error) {
        console.error("Error saving assessment:", error);
        res.status(500).json({ error: "Failed to save assessment to MongoDB" });
    }
};

// =========================================================================
// ENDPOINT: Get Latest Assessment
// =========================================================================
exports.getAssessmentHandler = async (req, res) => {
    const { userId } = req.params;

    try {
        // Since we use upsert, there is only ever ONE document per user.
        // We fetch it and return it as a plain JSON object (.lean())
        const assessment = await Assessment.findOne({ userId }).lean();

        if (!assessment) {
            return res.status(404).json({ message: "No assessment found for this user." });
        }

        res.status(200).json(assessment);
    } catch (error) {
        console.error("Error fetching assessment:", error);
        res.status(500).json({ error: "Failed to fetch assessment" });
    }
};