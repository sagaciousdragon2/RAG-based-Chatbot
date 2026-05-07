# Walkout Tech AI Assistant

An intelligent, Retrieval-Augmented Generation (RAG) based chatbot designed to provide context-aware responses, manage bookings, and handle sales inquiries for Walkout Tech. The chatbot utilizes a local vector database for semantic search and leverages Groq's high-speed inference for response generation.

##  Key Features

###  Advanced RAG Architecture
- **Semantic Search**: Uses local Sentence Transformers (`all-MiniLM-L6-v2`) to generate embeddings.
- **Vector Database**: Utilizes **ChromaDB** for fast, local vector retrieval.
- **LLM Generation**: Powered by **Groq API** (`llama-3.3-70b-versatile`) to generate precise and fast answers based strictly on the retrieved knowledge base.

###  Built-in Guard Rails
- **Harmful Content Filtering**: Hardcoded filters immediately block and refuse harmful, dangerous, or out-of-bounds queries without pinging the LLM.
- **Intent Detection & Routing**: Effectively detects specific intents:
  - **Consultation/Demo Requests**: Immediately prompts the interactive Booking form.
  - **Pricing/Sales Inquiries**: Directly routes the user to the Contact/Sales team card.
- **Hallucination Prevention**: Prompt engineering enforces strict reliance on the given context. If Groq API fails, it safely falls back to presenting the raw retrieved context.
- **Identity Enforcement**: The bot explicitly introduces itself as a Walkout Tech assistant and refuses to act outside of its persona.

###  Modern Tech Stack
- **Backend**: Python, FastAPI, PyMongo
- **Frontend**: React, Vite
- **Database**: MongoDB (Local)
- **AI / ML**: Groq, ChromaDB, Sentence-Transformers

---

##  Getting Started & Installation

Ensure you have the following installed on your system before proceeding:
- [Git](https://git-scm.com/)
- [Python 3.9+](https://www.python.org/downloads/)
- [Node.js (v18+)](https://nodejs.org/)
- [MongoDB](https://www.mongodb.com/try/download/community) (Running locally on port `27017`)

### 1. Clone the Repository
```bash
git clone https://github.com/sagaciousdragon2/chatbot-final-walkout.git
cd chatbot-final-walkout
```

### 2. Backend Setup
Navigate to the backend directory, install the required python packages, and set up your environment variables.

```bash
cd backend
pip install -r requirements.txt
```

**Environment Variables:**
Create a `.env` file in the `backend/` directory and configure the following variables:
```ini
# Required: Your Groq API Key (Get it from console.groq.com)
GROQ_API_KEY=your_groq_api_key_here

# MongoDB Setup
MONGODB_URI=mongodb://localhost:27017/
DB_NAME=ai_assistant_db
COLLECTION_NAME=kb_articles
```

**Run the Backend:**
Start the FastAPI server.
```bash
python -m uvicorn main:app --reload
```
The backend API will run on `http://localhost:8000`.

### 3. Frontend Setup
Open a new terminal window to start the frontend React application.

```bash
cd frontend
npm install
npm run dev
```
The frontend should now be running on `http://localhost:5173` (or the port shown in your terminal).

## 💡 Usage

- Head over to the frontend URL to interface with the bot.
- You can query about Walkout Tech's services, ask for detailed information on what they offer, or attempt to schedule a demo. 
- Try booking a demo or asking for pricing to see the intent routing override the LLM and instantly render the appropriate interactive UI components!
