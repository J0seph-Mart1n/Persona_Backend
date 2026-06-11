# Persona Backend Server

Welcome to the Persona Backend! This is a Node.js and Express server that powers the core logic, AI pipelines, and knowledge graph persistence for the Persona app.

It handles data ingestion (via assessments, profile bios, and resume parsing), vector embeddings, and Graph RAG (Retrieval-Augmented Generation) using a Neo4j database and MongoDB.

## 🚀 Features & Functionality

*   **100% Offline Architecture:** Uses local MongoDB for user profile storage (no Firebase Auth required) and local LLMs.
*   **Graph RAG & Vector Embeddings:** Uses a local Ollama instance (running embedding models like `nomic-embed-text`) to generate semantic embeddings for traits, domains, and entities, which are then persisted as vector properties in Neo4j.
*   **LLM Intelligence:** Deep integration with local Ollama chat models (e.g., `llama3.2`) for processing unstructured text into strict JSON traits, domains, and entities. Completely local and private.
*   **PDF Resume Parsing:** Uses `multer` (in-memory) and `pdf-parse` to process document uploads natively, extracting professional capabilities via the LLM.
*   **Self-Updating Chat Graph:** Processes user queries and streams a personalized LLM response back. Simultaneously, a fire-and-forget background process analyzes the conversation to extract and ingest new psychological traits or domains directly into the graph.

## 🛠️ Technology Stack

*   **Server:** Node.js, Express.js
*   **Graph Database:** Neo4j (Graph Database with Vector Search capabilities)
*   **Primary Database:** MongoDB (Local User Profiles & Chat History)
*   **LLM Provider:** Local Ollama SDK (`llama3.2` or configurable)
*   **Embedding Model:** Local Ollama Embeddings (`nomic-embed-text`)
*   **Utilities:** `mongoose`, `multer`, `pdf-parse`, `cors`, `dotenv`

## 📦 Setup & Installation

1.  **Clone / Navigate to the Directory:**
    ```bash
    cd persona_backend
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Ensure External Services are Running:**
    *   **Neo4j:** Running locally on port `7687`
    *   **MongoDB:** Running locally on port `27017`
    *   **Ollama:** Running locally on port `11434` with your configured models pulled.

4.  **Environment Variables:**
    Create a `.env` file in the root of the `persona_backend` folder.
    ```env
    PORT=5000
    
    # Model Configuration
    LOCAL_LLM_MODEL="llama3.2"
    LOCAL_EMBEDDING_MODEL="nomic-embed-text"
    OLLAMA_HOST="http://127.0.0.1:11434"

    # MongoDB Configuration
    MONGODB_URI="your_uri"
    
    # Neo4j Database Configuration
    NEO4J_URI="your_uri"
    NEO4J_USERNAME="username"
    NEO4J_PASSWORD="your-secure-password"
    ```

5.  **Run the Server:**
    ```bash
    node server.js
    # OR using nodemon for development:
    # npx nodemon server.js
    ```
    The backend will start running on `http://localhost:5000`.

## 📡 API Endpoints

*   **`POST /api/process-assessment`**
    Accepts MBTI vectors and raw answers, uses the local LLM to extract baseline behavioral traits, embeds them, and saves to Neo4j.
*   **`GET /api/graph/:userId`**
    Fetches a structural representation of the user's graph (User, Traits, Domains, Entities) formatted specifically for the frontend `react-force-graph` visualization arrays.
*   **`POST /api/chat`**
    The main Graph RAG endpoint. Vector-matches the user's query against their existing traits in Neo4j, using the result as context for the LLM response. Concurrently triggers background graph extraction.
*   **`GET & PUT /api/profile`**
    Manages the offline user profile (Bio, Username, Onboarding Status) stored in MongoDB.
*   **`POST /api/ingest/resume`**
    Expects a `multipart/form-data` payload containing a PDF `resumeFile`. Extracts text, parses professional traits/domains, and ingests them into the graph.
