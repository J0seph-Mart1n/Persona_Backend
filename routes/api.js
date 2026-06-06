const express = require('express');
const multer = require('multer');

const processAssessmentHandler = require('./process-assessment');
const graphHandler = require('./graph');
const chatHandler = require('./chat');
const resumeUploadHandler = require('./resume-upload');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = (ollama, driver) => {
    const router = express.Router();

    // =========================================================================
    // ENDPOINT 1: Process the Assessment (Groq -> HuggingFace -> Neo4j)
    // =========================================================================
    router.post('/process-assessment', processAssessmentHandler(ollama, driver));

    // =========================================================================
    // ENDPOINT 2: Fetch Graph Data for Next.js Visualization
    // =========================================================================
    router.get('/graph/:userId', graphHandler(ollama, driver));

    // =========================================================================
    // ENDPOINT 3: Personalized Chat Assistant (LLM + Vector Graph Context)
    // =========================================================================
    router.post('/chat', chatHandler(ollama, driver));

    // =========================================================================
    // ENDPOINT 4: Resume Upload & Extraction
    // =========================================================================
    router.post('/ingest/resume', upload.single('resumeFile'), resumeUploadHandler(ollama, driver));

    return router;
};
