# Persona Backend Server

Welcome to the Persona Backend! This is a Node.js and Express server that powers the core logic, AI pipelines, and knowledge graph persistence for the Persona app. 

It handles data ingestion (via assessments, social profiles, and resume parsing), vector embeddings, and Graph RAG (Retrieval-Augmented Generation) using a Neo4j database.

## 🚀 Features & Functionality

*   **Modular API Architecture:** Cleanly separated routing for different AI endpoints under the `/api` namespace.
*   **Graph RAG & Vector Embeddings:** Uses HuggingFace (`BAAI/bge-small-en-v1.5`) to generate semantic embeddings for traits, domains, and entities, which are then persisted as vector properties in Neo4j.
*   **Headless Social Scraping:** Integrates `playwright-extra` and stealth plugins to scrape public URLs (like GitHub), feeding the text directly into the LLM for domain extraction.
*   **PDF Resume Parsing:** Uses `multer` (in-memory) and `pdf-parse` (modern v2.4.5 class-based API) to process document uploads natively.
*   **LLM Intelligence:** Deep integration with the `groq-sdk` (running `llama-3.3-70b-versatile`) for lightning-fast parsing of unstructured text into strict JSON traits, domains, and entities.
*   **Context-Aware Chat:** Processes user queries, searches the Neo4j graph for the most relevant vector-matched traits, and streams a personalized LLM response back.

## 🛠️ Technology Stack

*   **Server:** Node.js, Express.js
*   **Database:** Neo4j (Graph Database with Vector Search capabilities)
*   **LLM Provider:** Groq SDK (`llama-3.3-70b-versatile`)
*   **Embedding Model:** HuggingFace Inference (`BAAI/bge-small-en-v1.5`)
*   **Scraping:** Playwright, Playwright-Extra
*   **Utilities:** `multer`, `pdf-parse`, `cors`, `dotenv`

## 📦 Setup & Installation

1.  **Clone / Navigate to the Directory:**
    ```bash
    cd persona_backend
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Variables:**
    Create a `.env` file in the root of the `persona_backend` folder. You will need API keys for Groq, HuggingFace, and Neo4j credentials.
    ```env
    PORT=5000
    GROQ_API_KEY="your-groq-api-key"
    HF_TOKEN="your-huggingface-token"
    
    # Neo4j Database Configuration
    NEO4J_URI="bolt://localhost:7687"
    NEO4J_USER="neo4j"
    NEO4J_PASSWORD="your-secure-password"
    ```

4.  **Run the Server:**
    ```bash
    node server.js
    # OR using nodemon for development:
    # npx nodemon server.js
    ```
    The backend will start running on `http://localhost:5000`.

## 📡 API Endpoints

*   **`POST /api/process-assessment`**
    Accepts MBTI vectors and raw answers, uses Groq to extract 5 baseline behavioral traits, embeds them, and saves to Neo4j.
*   **`GET /api/graph/:userId`**
    Fetches a structural representation of the user's graph (User, Traits, Domains, Entities) formatted specifically for the frontend `react-force-graph` arrays.
*   **`POST /api/chat`**
    The main Graph RAG endpoint. Vector-matches the user's query against their existing traits in Neo4j, using the result as context for the Groq LLM response.
*   **`POST /api/ingest/social`**
    Expects a `profileUrl` (e.g., GitHub). Scrapes the page headlessly and extracts professional traits, domains, and entities.
*   **`POST /api/ingest/resume`**
    Expects a `multipart/form-data` payload containing a PDF `resumeFile`. Extracts text, parses professional traits/domains, and ingests them into the graph.
