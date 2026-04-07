import io
import csv
import uuid
import logging
import bcrypt
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, field_validator
from fastapi.middleware.cors import CORSMiddleware
from pymongo import MongoClient, ASCENDING, DESCENDING
from dotenv import load_dotenv
from rag_engine import rag_engine
from tts_engine import tts_engine
import os
import json

load_dotenv()

# ── Logging ──
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("smartchat")

# ── MongoDB Setup ──
mongo_uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
db_name = os.getenv("DB_NAME", "ai_assistant_db")
mongo_client = MongoClient(mongo_uri)
db = mongo_client[db_name]
leads_collection = db["leads"]
messages_collection = db["chat_messages"]
agents_collection = db["agents"]
chat_requests_collection = db["chat_requests"]
bookings_collection = db["bookings"]

# ── Agent Management ──
# In-memory agent tracking (production would use Redis / DB)
active_agents = {}  # agent_id -> { name, available, current_sessions: [] }
online_agents = {}  # email -> { name, email, connected_at }

# Track active WebSocket connections per session (chat)
ws_connections: dict[str, list[WebSocket]] = {}
# Track dashboard WebSocket connections for real-time notifications
dashboard_ws_connections: list[WebSocket] = []
# Track dashboard WS connections with agent identity
agent_ws_map: dict[str, WebSocket] = {}  # email -> WebSocket


def setup_indexes():
    """Create MongoDB indexes for optimal query performance."""
    try:
        # Leads indexes
        leads_collection.create_index([("session_id", ASCENDING)], unique=True)
        leads_collection.create_index([("status", ASCENDING)])
        leads_collection.create_index([("created_at", DESCENDING)])
        leads_collection.create_index([("email", ASCENDING)])

        # Messages indexes
        messages_collection.create_index([("session_id", ASCENDING), ("timestamp", ASCENDING)])
        messages_collection.create_index([("session_id", ASCENDING), ("role", ASCENDING)])

        # Agents indexes
        agents_collection.create_index([("email", ASCENDING)], unique=True)

        # Chat requests indexes
        chat_requests_collection.create_index([("session_id", ASCENDING)])
        chat_requests_collection.create_index([("status", ASCENDING)])

        # Bookings indexes
        bookings_collection.create_index([("session_id", ASCENDING)])
        bookings_collection.create_index([("date", ASCENDING)])

        logger.info("MongoDB indexes created successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan — runs on startup and shutdown."""
    setup_indexes()
    logger.info("Smartchat backend started")
    yield
    logger.info("Smartchat backend shutting down")


app = FastAPI(title="Smartchat", version="2.1.0", lifespan=lifespan)

# Allow CORS for frontend on Netlify (and any other origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://smartchat-walkout-8b01d5.netlify.app",
        "http://localhost:5173",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic Models ──

class ChatRequest(BaseModel):
    message: str
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str


class StartChatRequest(BaseModel):
    name: str
    email: str
    phone: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Name is required")
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_valid(cls, v):
        import re
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v.strip()):
            raise ValueError("Invalid email format")
        return v.strip().lower()

    @field_validator("phone")
    @classmethod
    def phone_valid(cls, v):
        import re
        cleaned = re.sub(r"[\s\-\(\)]", "", v)
        if not re.match(r"^\+?\d{7,15}$", cleaned):
            raise ValueError("Invalid phone number")
        return v.strip()


class StartChatResponse(BaseModel):
    session_id: str
    message: str


class LeadStatusUpdate(BaseModel):
    status: str  # new, assigned, closed

    @field_validator("status")
    @classmethod
    def status_valid(cls, v):
        allowed = {"new", "assigned", "closed"}
        if v not in allowed:
            raise ValueError(f"Status must be one of: {', '.join(allowed)}")
        return v


class AgentTakeoverRequest(BaseModel):
    agent_name: str
    session_id: str


class AgentMessageRequest(BaseModel):
    session_id: str
    agent_name: str
    message: str


class EndSessionRequest(BaseModel):
    session_id: str
    agent_name: str


class AgentSignupRequest(BaseModel):
    name: str
    email: str
    password: str

    @field_validator("name")
    @classmethod
    def name_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Name is required")
        return v.strip()

    @field_validator("email")
    @classmethod
    def email_valid(cls, v):
        import re
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v.strip()):
            raise ValueError("Invalid email format")
        return v.strip().lower()

    @field_validator("password")
    @classmethod
    def password_valid(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v


class AgentLoginRequest(BaseModel):
    email: str
    password: str


class ChatRequestModel(BaseModel):
    session_id: str
    user_name: str | None = None


class AcceptChatRequest(BaseModel):
    request_id: str
    agent_name: str
    agent_email: str
    session_id: str


class BookingRequest(BaseModel):
    session_id: str
    date: str  # dd-mm-yyyy
    time: str  # HH:MM
    user_name: str | None = None
    user_email: str | None = None
    user_phone: str | None = None


# ── Helper: Broadcast ──

async def broadcast_to_session(session_id: str, data: dict):
    """Broadcast a message to all WebSocket connections for a session."""
    if session_id in ws_connections:
        dead = []
        for ws in ws_connections[session_id]:
            try:
                await ws.send_json(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            ws_connections[session_id].remove(ws)


async def broadcast_to_dashboard(data: dict):
    """Broadcast a notification to all connected dashboard clients."""
    dead = []
    for ws in dashboard_ws_connections:
        try:
            await ws.send_json(data)
        except Exception:
            dead.append(ws)
    for ws in dead:
        dashboard_ws_connections.remove(ws)


# ── Endpoints ──

@app.get("/health")
def health_check():
    return {"status": "healthy", "version": "2.1.0"}


@app.post("/seed")
def seed_database():
    try:
        result = rag_engine.seed_data()
        return result
    except UnicodeEncodeError:
        return {"status": "success", "message": "Database seeded with Walkout Tech data (unicode print warning suppressed)"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Agent Auth ──

@app.post("/api/agent/signup")
def agent_signup(request: AgentSignupRequest):
    """Register a new sales agent."""
    try:
        existing = agents_collection.find_one({"email": request.email})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        hashed = bcrypt.hashpw(request.password.encode("utf-8"), bcrypt.gensalt())
        agent = {
            "name": request.name,
            "email": request.email,
            "password_hash": hashed.decode("utf-8"),
            "created_at": datetime.now(timezone.utc),
        }
        agents_collection.insert_one(agent)
        logger.info(f"[Agent] New agent registered: {request.name} ({request.email})")
        return {"message": "Agent registered successfully", "name": request.name, "email": request.email}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Agent Signup] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/login")
def agent_login(request: AgentLoginRequest):
    """Authenticate a sales agent."""
    try:
        agent = agents_collection.find_one({"email": request.email.strip().lower()})
        if not agent:
            raise HTTPException(status_code=401, detail="Invalid email or password")
        if not bcrypt.checkpw(request.password.encode("utf-8"), agent["password_hash"].encode("utf-8")):
            raise HTTPException(status_code=401, detail="Invalid email or password")
        # Mark agent as online
        online_agents[agent["email"]] = {
            "name": agent["name"],
            "email": agent["email"],
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }
        logger.info(f"[Agent] Login: {agent['name']} ({agent['email']})")
        return {"message": "Login successful", "name": agent["name"], "email": agent["email"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Agent Login] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/logout")
def agent_logout(email: str):
    """Mark agent as offline."""
    if email in online_agents:
        del online_agents[email]
    return {"message": "Logged out"}


@app.get("/api/agents/online")
def get_online_agents():
    """Check how many agents are currently online."""
    return {
        "agents_online": len(online_agents) > 0,
        "count": len(online_agents),
        "agents": list(online_agents.values()),
    }


# ── Chat Request / Accept Flow ──

@app.post("/api/agent/request-chat")
async def request_chat(request: ChatRequestModel):
    """User requests to talk to a live agent."""
    try:
        # Check if agents are online
        if len(online_agents) == 0:
            return {"status": "no_agents", "message": "No agents are currently online"}
        # Check if there's already a pending request for this session
        existing = chat_requests_collection.find_one({
            "session_id": request.session_id,
            "status": "pending"
        })
        if existing:
            return {"status": "already_pending", "message": "Request already pending"}
        req_id = str(uuid.uuid4())[:12]
        chat_req = {
            "request_id": req_id,
            "session_id": request.session_id,
            "user_name": request.user_name,
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
        }
        chat_requests_collection.insert_one(chat_req)
        # Notify all dashboard clients about the new request
        await broadcast_to_dashboard({
            "type": "chat_request",
            "request_id": req_id,
            "session_id": request.session_id,
            "user_name": request.user_name,
        })
        logger.info(f"[ChatRequest] New request from session {request.session_id}")
        return {"status": "pending", "request_id": req_id, "message": "Request sent to agents"}
    except Exception as e:
        logger.error(f"[ChatRequest] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/accept-chat")
async def accept_chat(request: AcceptChatRequest):
    """Agent accepts a pending chat request."""
    try:
        chat_req = chat_requests_collection.find_one({
            "request_id": request.request_id,
            "status": "pending"
        })
        if not chat_req:
            raise HTTPException(status_code=404, detail="Request not found or already handled")
        # Update request status
        chat_requests_collection.update_one(
            {"request_id": request.request_id},
            {"$set": {"status": "accepted", "accepted_by": request.agent_name}}
        )
        # Do the agent takeover
        leads_collection.update_one(
            {"session_id": request.session_id},
            {"$set": {"assigned_agent": request.agent_name, "status": "assigned"}}
        )
        # Store system message
        messages_collection.insert_one({
            "session_id": request.session_id,
            "role": "system",
            "content": f"Agent {request.agent_name} has joined the chat.",
            "timestamp": datetime.now(timezone.utc),
        })
        # Notify user via WebSocket
        await broadcast_to_session(request.session_id, {
            "type": "agent_joined",
            "agent_name": request.agent_name,
            "message": f"Agent {request.agent_name} has joined the chat."
        })
        # Notify dashboard
        await broadcast_to_dashboard({
            "type": "request_accepted",
            "request_id": request.request_id,
            "session_id": request.session_id,
            "agent_name": request.agent_name,
        })
        logger.info(f"[ChatRequest] Accepted by {request.agent_name} for session {request.session_id}")
        return {"message": f"Chat accepted by {request.agent_name}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[ChatRequest] Accept error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agent/pending-requests")
def get_pending_requests():
    """Get all pending chat requests for the dashboard."""
    try:
        requests = list(chat_requests_collection.find(
            {"status": "pending"},
            {"_id": 0}
        ).sort("created_at", -1))
        for req in requests:
            if isinstance(req.get("created_at"), datetime):
                req["created_at"] = req["created_at"].isoformat()
            # Get lead info
            lead = leads_collection.find_one({"session_id": req["session_id"]}, {"_id": 0, "name": 1, "email": 1})
            if lead:
                req["user_name"] = lead.get("name", req.get("user_name", "Unknown"))
                req["user_email"] = lead.get("email", "")
        return {"requests": requests}
    except Exception as e:
        logger.error(f"[ChatRequest] Fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Bookings ──

@app.post("/api/bookings")
async def create_booking(request: BookingRequest):
    """Create a new consultation booking."""
    try:
        booking_id = str(uuid.uuid4())[:12]
        booking = {
            "booking_id": booking_id,
            "session_id": request.session_id,
            "date": request.date,
            "time": request.time,
            "user_name": request.user_name,
            "user_email": request.user_email,
            "user_phone": request.user_phone,
            "status": "scheduled",
            "created_at": datetime.now(timezone.utc),
        }
        bookings_collection.insert_one(booking)
        
        # Notify dashboard
        await broadcast_to_dashboard({
            "type": "new_booking",
            "booking": {
                **booking,
                "created_at": booking["created_at"].isoformat()
            }
        })
        
        logger.info(f"[Booking] New booking created: {booking_id} for {request.date} at {request.time}")
        return {"status": "success", "booking_id": booking_id, "message": "Booking confirmed"}
    except Exception as e:
        logger.error(f"[Booking] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bookings")
def get_bookings():
    """Get all consultation bookings."""
    try:
        bookings = list(bookings_collection.find({}, {"_id": 0}).sort("date", ASCENDING))
        for b in bookings:
            if isinstance(b.get("created_at"), datetime):
                b["created_at"] = b["created_at"].isoformat()
        return {"bookings": bookings}
    except Exception as e:
        logger.error(f"[Booking] Fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Lead Capture ──

@app.post("/api/start-chat", response_model=StartChatResponse)
async def start_chat(request: StartChatRequest):
    """Capture lead info and generate a chat session."""
    try:
        # Check for duplicate email within last 24 hours (prevent spam)
        existing = leads_collection.find_one({
            "email": request.email,
            "created_at": {"$gte": datetime(
                datetime.now(timezone.utc).year,
                datetime.now(timezone.utc).month,
                datetime.now(timezone.utc).day,
                tzinfo=timezone.utc
            )}
        })

        session_id = str(uuid.uuid4())
        lead = {
            "name": request.name,
            "email": request.email,
            "phone": request.phone,
            "session_id": session_id,
            "status": "new",
            "assigned_agent": None,
            "created_at": datetime.now(timezone.utc),
        }
        leads_collection.insert_one(lead)
        logger.info(f"[Lead] New lead captured: {request.name} ({request.email}) — session {session_id}")

        # Notify dashboard clients about the new lead
        await broadcast_to_dashboard({
            "type": "new_lead",
            "lead": {
                "name": request.name,
                "email": request.email,
                "phone": request.phone,
                "session_id": session_id,
                "status": "new",
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        })

        return StartChatResponse(
            session_id=session_id,
            message="Chat session started successfully"
        )
    except Exception as e:
        logger.error(f"[Lead] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat with session tracking ──

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    try:
        # Store user message if session_id is provided
        if request.session_id:
            messages_collection.insert_one({
                "session_id": request.session_id,
                "role": "user",
                "content": request.message,
                "timestamp": datetime.now(timezone.utc),
            })
            # Broadcast user message to connected agents via WebSocket
            await broadcast_to_session(request.session_id, {
                "type": "user_message",
                "role": "user",
                "content": request.message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            # Notify dashboard of new message activity
            await broadcast_to_dashboard({
                "type": "new_message",
                "session_id": request.session_id,
                "role": "user",
                "preview": request.message[:80],
            })

        # Check if an agent has taken over this session
        if request.session_id:
            lead = leads_collection.find_one({"session_id": request.session_id})
            if lead and lead.get("assigned_agent"):
                # Agent is handling — don't generate AI response, just store and wait
                return ChatResponse(response="__AGENT_ACTIVE__")

        response_text = rag_engine.chat(request.message)

        # Store assistant message if session_id is provided
        if request.session_id:
            messages_collection.insert_one({
                "session_id": request.session_id,
                "role": "assistant",
                "content": response_text,
                "timestamp": datetime.now(timezone.utc),
            })

        return {"response": response_text}
    except Exception as e:
        logger.error(f"[Chat] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/speak")
async def speak_endpoint(request: ChatRequest):
    try:
        return StreamingResponse(
            tts_engine.stream_audio(request.message),
            media_type="audio/mpeg"
        )
    except Exception as e:
        logger.error(f"[TTS] Endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Leads Dashboard ──

@app.get("/api/leads")
def get_leads():
    """Fetch all leads for the sales dashboard with message counts."""
    try:
        leads = list(leads_collection.find(
            {},
            {"_id": 0, "name": 1, "email": 1, "phone": 1, "session_id": 1,
             "status": 1, "assigned_agent": 1, "created_at": 1}
        ).sort("created_at", -1))

        # Attach the latest message and message count for each lead
        for lead in leads:
            sid = lead["session_id"]

            # Latest user message
            latest_msg = messages_collection.find_one(
                {"session_id": sid, "role": "user"},
                sort=[("timestamp", -1)]
            )
            lead["last_message"] = latest_msg["content"] if latest_msg else "No messages yet"

            # Total message count for this session
            lead["message_count"] = messages_collection.count_documents({"session_id": sid})

            # Convert datetime for JSON serialization
            if isinstance(lead.get("created_at"), datetime):
                lead["created_at"] = lead["created_at"].isoformat()

        return {"leads": leads}
    except Exception as e:
        logger.error(f"[Dashboard] Error fetching leads: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/lead/{session_id}/status")
async def update_lead_status(session_id: str, update: LeadStatusUpdate):
    """Update lead status (new / assigned / closed)."""
    try:
        result = leads_collection.update_one(
            {"session_id": session_id},
            {"$set": {"status": update.status}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Lead not found")

        # Notify dashboard
        await broadcast_to_dashboard({
            "type": "status_changed",
            "session_id": session_id,
            "status": update.status,
        })

        return {"message": "Status updated", "status": update.status}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/lead/{session_id}")
async def delete_lead(session_id: str):
    """Delete a lead and all associated messages, requests, and bookings."""
    try:
        # 1. Delete messages
        messages_collection.delete_many({"session_id": session_id})
        
        # 2. Delete chat requests
        chat_requests_collection.delete_many({"session_id": session_id})
        
        # 3. Delete bookings
        bookings_collection.delete_many({"session_id": session_id})
        
        # 4. Delete lead
        result = leads_collection.delete_one({"session_id": session_id})
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Lead not found")

        # 5. Notify dashboard
        await broadcast_to_dashboard({
            "type": "lead_deleted",
            "session_id": session_id,
        })

        logger.info(f"[Lead] Deleted session {session_id}")
        return {"message": "Lead and associated data deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Lead] Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Chat History ──

@app.get("/api/chat-history/{session_id}")
def get_chat_history(session_id: str):
    """Fetch all messages for a session."""
    try:
        messages = list(messages_collection.find(
            {"session_id": session_id},
            {"_id": 0, "role": 1, "content": 1, "timestamp": 1, "agent_name": 1}
        ).sort("timestamp", 1))
        for msg in messages:
            if isinstance(msg.get("timestamp"), datetime):
                msg["timestamp"] = msg["timestamp"].isoformat()
        return {"messages": messages}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Agent System ──

@app.get("/api/agents/status")
def get_agents_status():
    """Check if any agents are available."""
    available = [a for a in active_agents.values() if a["available"]]
    return {
        "agents_available": len(available) > 0,
        "available_count": len(available),
        "total_agents": len(active_agents),
        "agents": list(active_agents.values())
    }


@app.post("/api/agent/register")
def register_agent(agent_name: str):
    """Register a new agent as available."""
    agent_id = str(uuid.uuid4())[:8]
    active_agents[agent_id] = {
        "agent_id": agent_id,
        "name": agent_name,
        "available": True,
        "current_sessions": []
    }
    return {"agent_id": agent_id, "message": f"Agent {agent_name} registered"}


@app.post("/api/agent/takeover")
async def agent_takeover(request: AgentTakeoverRequest):
    """Agent takes over a chat session from the bot."""
    try:
        lead = leads_collection.find_one({"session_id": request.session_id})
        if not lead:
            raise HTTPException(status_code=404, detail="Session not found")

        leads_collection.update_one(
            {"session_id": request.session_id},
            {"$set": {
                "assigned_agent": request.agent_name,
                "status": "assigned"
            }}
        )

        # Store system message about takeover
        messages_collection.insert_one({
            "session_id": request.session_id,
            "role": "system",
            "content": f"Agent {request.agent_name} has joined the chat.",
            "timestamp": datetime.now(timezone.utc),
        })

        # Notify user via WebSocket
        await broadcast_to_session(request.session_id, {
            "type": "agent_joined",
            "agent_name": request.agent_name,
            "message": f"Agent {request.agent_name} has joined the chat."
        })

        # Notify dashboard
        await broadcast_to_dashboard({
            "type": "agent_takeover",
            "session_id": request.session_id,
            "agent_name": request.agent_name,
        })

        logger.info(f"[Agent] {request.agent_name} took over session {request.session_id}")
        return {"message": f"Agent {request.agent_name} took over session {request.session_id}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Agent] Takeover error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/message")
async def agent_send_message(request: AgentMessageRequest):
    """Agent sends a message to the user."""
    try:
        # Store agent message
        messages_collection.insert_one({
            "session_id": request.session_id,
            "role": "agent",
            "content": request.message,
            "agent_name": request.agent_name,
            "timestamp": datetime.now(timezone.utc),
        })

        # Broadcast to user via WebSocket
        await broadcast_to_session(request.session_id, {
            "type": "agent_message",
            "role": "agent",
            "content": request.message,
            "agent_name": request.agent_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        return {"message": "Sent"}
    except Exception as e:
        logger.error(f"[Agent] Send message error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/agent/end-session")
async def agent_end_session(request: EndSessionRequest):
    """Agent ends/releases a chat session back to bot mode."""
    try:
        lead = leads_collection.find_one({"session_id": request.session_id})
        if not lead:
            raise HTTPException(status_code=404, detail="Session not found")

        leads_collection.update_one(
            {"session_id": request.session_id},
            {"$set": {
                "assigned_agent": None,
                "status": "closed"
            }}
        )

        # Store system message
        messages_collection.insert_one({
            "session_id": request.session_id,
            "role": "system",
            "content": f"Agent {request.agent_name} has ended the session.",
            "timestamp": datetime.now(timezone.utc),
        })

        # Notify user via WebSocket
        await broadcast_to_session(request.session_id, {
            "type": "agent_left",
            "agent_name": request.agent_name,
            "message": f"Agent {request.agent_name} has ended the session."
        })

        # Notify dashboard
        await broadcast_to_dashboard({
            "type": "session_ended",
            "session_id": request.session_id,
            "agent_name": request.agent_name,
        })

        logger.info(f"[Agent] {request.agent_name} ended session {request.session_id}")
        return {"message": f"Session {request.session_id} ended by {request.agent_name}"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[Agent] End session error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Export Leads ──

@app.get("/api/leads/export")
def export_leads():
    """Export all leads as a downloadable CSV file."""
    try:
        leads = list(leads_collection.find(
            {},
            {"_id": 0, "name": 1, "email": 1, "phone": 1, "session_id": 1,
             "status": 1, "assigned_agent": 1, "created_at": 1}
        ).sort("created_at", -1))

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=[
            "name", "email", "phone", "session_id", "status", "assigned_agent", "created_at"
        ])
        writer.writeheader()

        for lead in leads:
            if isinstance(lead.get("created_at"), datetime):
                lead["created_at"] = lead["created_at"].strftime("%Y-%m-%d %H:%M:%S")
            lead["assigned_agent"] = lead.get("assigned_agent") or ""
            writer.writerow(lead)

        csv_bytes = output.getvalue().encode("utf-8")
        filename = f"leads_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"

        return StreamingResponse(
            io.BytesIO(csv_bytes),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"[Export] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── Notification endpoint for new leads ──

@app.get("/api/leads/new-count")
def new_leads_count():
    """Get count of leads with status 'new' (for notification badge)."""
    count = leads_collection.count_documents({"status": "new"})
    return {"new_count": count}


# ── WebSocket for Live Chat ──

@app.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    await websocket.accept()

    if session_id not in ws_connections:
        ws_connections[session_id] = []
    ws_connections[session_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            if msg.get("type") == "typing":
                # Broadcast typing indicator to others in the session
                await broadcast_to_session(session_id, {
                    "type": "typing",
                    "role": msg.get("role", "user"),
                    "is_typing": msg.get("is_typing", False),
                })
            elif msg.get("type") == "message":
                # Store and broadcast
                messages_collection.insert_one({
                    "session_id": session_id,
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                    "timestamp": datetime.now(timezone.utc),
                })
                await broadcast_to_session(session_id, {
                    "type": "new_message",
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", ""),
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })

    except WebSocketDisconnect:
        if session_id in ws_connections:
            ws_connections[session_id] = [
                ws for ws in ws_connections[session_id] if ws != websocket
            ]
            if not ws_connections[session_id]:
                del ws_connections[session_id]


# ── WebSocket for Dashboard Real-time Updates ──

@app.websocket("/ws/dashboard")
async def websocket_dashboard(websocket: WebSocket):
    """WebSocket for real-time dashboard notifications (new leads, status changes)."""
    await websocket.accept()
    dashboard_ws_connections.append(websocket)
    logger.info(f"[Dashboard WS] Client connected. Total: {len(dashboard_ws_connections)}")

    try:
        while True:
            # Keep connection alive; dashboard can also send pings
            data = await websocket.receive_text()
            msg = json.loads(data)
            if msg.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        dashboard_ws_connections.remove(websocket)
        logger.info(f"[Dashboard WS] Client disconnected. Total: {len(dashboard_ws_connections)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
