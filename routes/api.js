const express = require('express');
const multer = require('multer');

const processAssessmentHandler = require('./process-assessment');
const graphHandler = require('./graph');
const chatHandler = require('./chat');
const ingestSocialHandler = require('./ingest-social');
const resumeUploadHandler = require('./resume-upload');

const upload = multer({ storage: multer.memoryStorage() });

module.exports = (groq, hf, driver) => {
    const router = express.Router();

    // =========================================================================
    // ENDPOINT 1: Process the Assessment (Groq -> HuggingFace -> Neo4j)
    // =========================================================================
    router.post('/process-assessment', processAssessmentHandler(groq, hf, driver));

    // =========================================================================
    // ENDPOINT 2: Fetch Graph Data for Next.js Visualization
    // =========================================================================
    router.get('/graph/:userId', graphHandler(groq, hf, driver));

    // =========================================================================
    // ENDPOINT 3: Personalized Chat Assistant (LLM + Vector Graph Context)
    // =========================================================================
    router.post('/chat', chatHandler(groq, hf, driver));

    // =========================================================================
    // ENDPOINT 4: Headless Social Profile Extraction & Ingestion
    // =========================================================================
    router.post('/ingest/social', ingestSocialHandler(groq, hf, driver));

    // =========================================================================
    // ENDPOINT 5: Resume Upload & Extraction
    // =========================================================================
    router.post('/ingest/resume', upload.single('resumeFile'), resumeUploadHandler(groq, hf, driver));

    return router;
};
