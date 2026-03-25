import sys
import io
# Force UTF-8 output on Windows to prevent unicode encoding errors from libraries
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import os
from pymongo import MongoClient
from dotenv import load_dotenv
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer
from groq import Groq

load_dotenv()

class RAGEngine:
    def __init__(self):
        # MongoDB Setup
        mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
        db_name = os.getenv("DB_NAME", "ai_assistant_db")
        collection_name = os.getenv("COLLECTION_NAME", "kb_articles")
        
        self.client = MongoClient(mongo_uri)
        self.db = self.client[db_name]
        self.collection = self.db[collection_name]
        
        # ChromaDB Setup (Vector Database)
        self.chroma_client = chromadb.PersistentClient(
            path="./chroma_db",
            settings=Settings(anonymized_telemetry=False)
        )
        # NOTE: Do NOT cache the collection here — always fetch fresh via get_collection()
        # so that re-seeding (which deletes/recreates the collection) never causes stale refs.
        
        # Embedding Model (Local - Free)
        print("Loading embedding model...")
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2', local_files_only=True)
        print("Embedding model loaded.")
        
        # Groq LLM
        groq_api_key = os.getenv("GROQ_API_KEY")
        self.groq_client = Groq(api_key=groq_api_key)
        self.llm_model = "llama-3.3-70b-versatile"  # Fast Groq-hosted model
        
    def generate_embedding(self, text: str):
        """Generate embedding vector for text"""
        return self.embedding_model.encode(text).tolist()
    
    def _get_collection(self):
        """Always fetch the ChromaDB collection fresh to avoid stale references after re-seeding."""
        return self.chroma_client.get_or_create_collection(
            name="kb_articles_vectors",
            metadata={"hnsw:space": "cosine"}
        )

    def seed_data(self):
        """
        Seed MongoDB and ChromaDB with knowledge base data
        """
        print("[Seed] Seeding database...")
        
        # Users
        users = [
            {"user_id": 1, "username": "admin", "email": "admin@walkouttech.com", "role": "Admin"}
        ]
        
        # Categories
        categories = [
            {"category_id": 1, "category_name": "Company Overview", "description": "About Walkout Tech"},
            {"category_id": 2, "category_name": "Services", "description": "Core services offered"},
            {"category_id": 3, "category_name": "Careers & Culture", "description": "Workplace and careers"}
        ]
        
        # Articles
        articles = [
            {
                "article_id": 1,
                "title": "About Walkout Tech",
                "content": "Walkout is a full-service digital solutions company founded in 2019, specializing in website development, mobile app development, content writing, SEO, and digital marketing. We deliver powerful, user-focused solutions tailored for businesses of all sizes - startups, SMEs, and enterprises. Our global content and technical teams help with personalized strategies. At Walkout Tech Private Ltd., we believe in transforming ideas into powerful digital experiences. We are Your Digital Evangelists. Company size: 51-200 employees. Industry: IT Services and IT Consulting.",
                "author_id": 1,
                "category_id": 1,
                "created_at": "2024-01-01",
                "views": 500
            },
            {
                "article_id": 2,
                "title": "Contact Walkout Tech",
                "content": "You can reach Walkout Tech for digital growth by visiting our website at https://walkouttech.com. Our team is happy to assist you with any inquiries about our services.",
                "author_id": 1,
                "category_id": 1,
                "created_at": "2024-01-02",
                "views": 300
            },
            {
                "article_id": 3,
                "title": "Website and Mobile App Development Services",
                "content": "We don’t just build websites—we build experiences. From responsive design and custom development to e-commerce platforms and CMS-based sites, we offer cutting-edge solutions. Our core services include Website Design & Development (Static, Dynamic, WordPress, E-commerce) and Android & iOS App Development. Our mobile app team creates seamless applications with high performance and scalability.",
                "author_id": 1,
                "category_id": 2,
                "created_at": "2024-01-05",
                "views": 400
            },
            {
                "article_id": 4,
                "title": "Digital Marketing, SEO, and Content Writing",
                "content": "Our content writers are industry-savvy storytellers who craft engaging, SEO-friendly copy (Web Copy, Blogs, Articles, Product Descriptions) to drive traffic. Our SEO and digital marketing specialists are data-driven growth hackers, delivering measurable ROI. We offer On-Page, Off-Page, and Technical SEO, as well as Digital Marketing including PPC, SMM, SEM, and Email Marketing.",
                "author_id": 1,
                "category_id": 2,
                "created_at": "2024-01-10",
                "views": 350
            },
            {
                "article_id": 5,
                "title": "Design and Branding Services",
                "content": "Walkout Tech offers UI/UX Design, Website Maintenance & Optimization, and Branding & Creative Services. We combine technology, creativity, and strategy to drive results. Whether you’re a startup looking to establish your online presence or an established brand aiming to expand, we help you dominate the digital world.",
                "author_id": 1,
                "category_id": 2,
                "created_at": "2024-01-15",
                "views": 200
            },
            {
                "article_id": 6,
                "title": "Hybrid Workplace and Careers",
                "content": "At Walkout Tech, we follow a Hybrid Work Model that offers flexibility while maintaining collaboration and productivity. Employees are expected to work from the office 2–3 days a week and can work remotely on the remaining days, based on team and project needs. We also prioritize continuous learning and career growth through on-the-job training, mentorship, and skill development opportunities.",
                "author_id": 1,
                "category_id": 3,
                "created_at": "2024-01-20",
                "views": 150
            }
        ]
        
        # Feedback
        feedback = [
            {"feedback_id": 1, "article_id": 1, "user_id": 1, "rating": 5, "comment": "Great summary of the company!"}
        ]
        
        try:
            import faq_data
            categories.extend(faq_data.faq_categories)
            articles.extend(faq_data.faq_articles)
        except ImportError:
            print("[Seed] faq_data.py not found, skipping FAQ insertion.")
        

        # Create lookup dictionaries
        user_map = {u["user_id"]: u["username"] for u in users}
        category_map = {c["category_id"]: c["category_name"] for c in categories}
        
        # Insert into MongoDB collections
        self.db["kb_users"].delete_many({})
        self.db["kb_users"].insert_many(users)
        
        self.db["kb_categories"].delete_many({})
        self.db["kb_categories"].insert_many(categories)
        
        self.db["kb_articles_raw"].delete_many({})
        self.db["kb_articles_raw"].insert_many(articles)
        
        self.db["kb_article_feedback"].delete_many({})
        self.db["kb_article_feedback"].insert_many(feedback)
        
        # Create searchable documents with denormalized data
        final_docs = []
        for article in articles:
            doc = {
                "article_id": article["article_id"],
                "title": article["title"],
                "content": article["content"],
                "author": user_map.get(article["author_id"], "Unknown"),
                "category": category_map.get(article["category_id"], "Uncategorized"),
                "created_at": article["created_at"],
                "views": article["views"]
            }
            final_docs.append(doc)
        
        # Insert into MongoDB main collection
        self.collection.delete_many({})
        self.collection.insert_many(final_docs)
        
        # === VECTOR DATABASE SEEDING ===
        print("[Seed] Generating embeddings and storing in ChromaDB...")
        
        # Clear existing vectors and create a fresh collection
        try:
            self.chroma_client.delete_collection("kb_articles_vectors")
        except Exception:
            pass
        vector_collection = self.chroma_client.create_collection(
            name="kb_articles_vectors",
            metadata={"hnsw:space": "cosine"}
        )
        
        # Prepare data for ChromaDB
        documents = []
        metadatas = []
        ids = []
        
        for doc in final_docs:
            # Combine title and content for better semantic search
            full_text = f"{doc['title']}. {doc['content']}"
            documents.append(full_text)
            
            metadatas.append({
                "article_id": str(doc["article_id"]),
                "title": doc["title"],
                "author": doc["author"],
                "category": doc["category"],
                "created_at": doc["created_at"],
                "views": doc["views"]
            })
            
            ids.append(f"article_{doc['article_id']}")
        
        # Add to ChromaDB using a fresh local reference
        vector_collection.add(
            documents=documents,
            metadatas=metadatas,
            ids=ids
        )
        
        print(f"[Seed] Seeded {len(final_docs)} articles into MongoDB")
        print("[Seed] Done.")
        return {"status": "success", "articles_count": len(final_docs), "message": f"Seeded {len(final_docs)} Walkout Tech articles"}
    
    # Signal token — frontend renders the contact card (PNG icons, show-once logic)
    CONTACT_BLOCK = "\n\n##CONTACT_CARD##"

    def chat(self, user_query: str):
        """
        RAG-based chat with semantic search and LLM response generation
        """
        print(f"\n[Query] {user_query}")
        
        user_query_clean = user_query.strip().lower()
        is_more_info = user_query_clean.startswith("more details about:")
        is_service_query = "service" in user_query_clean or "services" in user_query_clean
        if user_query_clean in ["hi", "hello", "hey"]:
            return "hello how may I help you"

        # Refuse harmful or unrelated queries
        harmful_patterns = [
            "how to kill",
            "kill ",
            "harm",
            "weapon",
            "suicide",
            "bomb",
            "drug",
            "poison",
            "terror",
            "hack",
            "exploit",
            "malware"
        ]
        if any(p in user_query_clean for p in harmful_patterns):
            return "We can't help with that."

        # Company-specific counts/details -> sales team
        sales_info_intent = [
            "how many users",
            "number of users",
            "client count",
            "how many clients",
            "pricing",
            "cost",
            "quote",
            "proposal"
        ]
        if any(p in user_query_clean for p in sales_info_intent):
            return "Sure — here’s our sales team.\n\n##CONTACT_CARD##"

        # Explicit sales/contact requests -> show contact card immediately
        sales_intent = [
            "sales team",
            "contact sales",
            "connect me",
            "connect us",
            "talk to sales",
            "sales contact",
            "reach sales",
            "sales support"
        ]
        if any(term in user_query_clean for term in sales_intent):
            return "Sure — here’s our sales team.\n\n##CONTACT_CARD##"

        # Booking / consultation requests -> send to sales team directly
        consultation_intent = [
            "free consultation",
            "book a consultation",
            "book consultation",
            "schedule a consultation",
            "consultation",
            "demo",
            "book a demo"
        ]
        if any(term in user_query_clean for term in consultation_intent):
            return "Connect with our sales team.\n\n##CONTACT_CARD##"
        
        # Detect name introduction: "my name is X", "I am X", "call me X", "I'm X"
        import re as _re
        name_match = _re.search(
            r"(?:my name is|i am|i'm|call me)\s+([a-zA-Z]+)",
            user_query_clean
        )
        if name_match:
            name = name_match.group(1).capitalize()
            return f"Hello {name}! How can I help you today?"
        
        # Step 1: Semantic Search in ChromaDB (always get fresh collection)
        results = self._get_collection().query(
            query_texts=[user_query],
            n_results=3  # Top 3 most relevant articles
        )
        if results is None:
            results = {}
        
        docs = results.get('documents') if isinstance(results, dict) else None
        if not docs or not docs[0]:
            relevant_keywords = [
                "walkout",
                "service",
                "services",
                "web",
                "website",
                "app",
                "saas",
                "chatbot",
                "seo",
                "marketing",
                "design",
                "branding",
                "content",
                "consultation",
                "support",
                "maintenance",
                "software",
                "digital",
                "ai"
            ]
            if any(k in user_query_clean for k in relevant_keywords):
                return "I can connect you to our sales team. Want me to do that?"
            return "We can't help with that."
        
        # Step 2: Extract retrieved documents
        retrieved_docs = (results.get('documents') or [[]])[0]
        retrieved_metadata = (results.get('metadatas') or [[]])[0]
        
        print(f"[Retrieved] {len(retrieved_docs)} relevant articles")
        
        # Step 3: Build context for LLM
        context = ""
        for i, (doc, meta) in enumerate(zip(retrieved_docs, retrieved_metadata), 1):
            context += f"\n--- Article {i}: {meta['title']} ---\n"
            context += f"Category: {meta['category']} | Author: {meta['author']}\n"
            context += f"{doc}\n"
        
        # Step 4: Create prompt for LLM
        prompt = f"""You are a helpful AI assistant for Walkout Tech. Answer the user's question based strictly on the following knowledge base articles.

KNOWLEDGE BASE:
{context}

USER QUESTION: {user_query}

STRICT RULES — follow these exactly:
1. Keep answers SHORT and structured (max 3–5 lines).
2. Use short sentences. Avoid long or complex phrasing.
3. Always respond as Walkout Tech using "we" and "our".
4. Include only key facts from the knowledge base.
5. Use bullet points when listing features or options.
6. If you include a sentence after a bullet list, put it on a NEW LINE after a blank line (no run-on).
7. Do NOT mention or offer sales team help unless the user explicitly asks to connect.
8. For greetings or casual conversation: respond naturally in 1–2 lines with no CTA.
8. If the user asks for more details and provides a Previous answer, add NEW points only. Do NOT repeat any items from that Previous answer.

16. Do not greet or give affirmation such as "Absolutely" or "Sure" at successive queries.
17. Do not use "Happy to help" at every query. Use greeting only once in the beginning.
18. Do not say "Of course" or similar affirmative words in successive queries.

ANSWER:"""
        
        # Step 5: Generate response using Groq
        try:
            print("[LLM] Calling Groq API...")
            response = self.groq_client.chat.completions.create(
                model=self.llm_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=256,
                temperature=0.7
            )
            
            answer = response.choices[0].message.content or ""
            print("[Response] Generated successfully via Groq")
            # Strip leading greeting/affirmation openers (LLM ignores prompt rules)
            import re
            answer = re.sub(
                r'^(Happy to help!|Sure!|Absolutely!|Of course!|Great!|Certainly!|No problem!|Indeed!)[,!\s]*',
                '', answer, flags=re.IGNORECASE
            ).lstrip()
            # Replace signal tag (##NEEDS_CONTACT##) with contact card token
            if "##NEEDS_CONTACT##" in answer:
                answer = answer.replace("##NEEDS_CONTACT##", "").rstrip() + "\n\n##CONTACT_CARD##"
                return answer

            lower_answer = answer.lower() if answer else ""

            # For follow-up "more info" requests, show contact CTA only
            if is_more_info:
                answer = answer.rstrip() + "\n\n##CONTACT_SALES##"
                return answer

            # Add a More Info token for UI button (skip for greetings/sales prompts)
            if is_service_query or ("sales team" not in lower_answer and "connect" not in lower_answer):
                answer = answer.rstrip() + "\n\n##MORE_INFO##"

            return answer
            
        except Exception as e:
            print(f"[Error] Groq error: {e}")
            # Fallback: return context directly if Groq fails
            fallback = f"**Based on the knowledge base:**\n\n{retrieved_docs[0]}\n\n"
            if len(retrieved_docs) > 1:
                fallback += "**Related information:**\n"
                for doc, meta in zip(retrieved_docs[1:], retrieved_metadata[1:]):
                    fallback += f"- {meta['title']}: {doc[:200]}...\n"
            
            fallback += f"\n\n*Note: Groq API error - {str(e)}*\n\n##MORE_INFO##"
            return fallback

rag_engine = RAGEngine()
