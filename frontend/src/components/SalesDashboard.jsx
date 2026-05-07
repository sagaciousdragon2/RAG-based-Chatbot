import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Bell, Send, LogOut, MessageCircle, CheckCircle, Calendar, Archive, Tag, Menu, X } from 'lucide-react';
import './SalesDashboard.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

// Simple notification sound using Web Audio API
const playNotificationSound = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(587.33, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.frequency.setValueAtTime(880, ctx.currentTime + 0.15);
        gain2.gain.setValueAtTime(0.15, ctx.currentTime + 0.15);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
        osc2.start(ctx.currentTime + 0.15);
        osc.stop(ctx.currentTime + 0.2);
        osc2.stop(ctx.currentTime + 0.45);
        setTimeout(() => ctx.close(), 1000);
    } catch (e) {
        console.warn('[Sound] Notification sound failed:', e);
    }
};

const SalesDashboard = ({ agentInfo, onLogout }) => {
    const [leads, setLeads] = useState([]);
    const [selectedLead, setSelectedLead] = useState(null);
    const [chatHistory, setChatHistory] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [agentMessage, setAgentMessage] = useState('');
    const [pendingRequests, setPendingRequests] = useState([]);
    const [bookings, setBookings] = useState([]);
    const [chatbotSettings, setChatbotSettings] = useState({ tts_provider: 'edge-tts' });
    const [newCount, setNewCount] = useState(0);
    const [wsConnected, setWsConnected] = useState(false);
    const [editingLabel, setEditingLabel] = useState(null);
    const [labelInput, setLabelInput] = useState('');
    const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, lead: null });
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null);
    const wsRef = useRef(null);
    const chatEndRef = useRef(null);
    const pollRef = useRef(null);

    const agentName = agentInfo?.name || 'Agent';
    const agentEmail = agentInfo?.email || '';

    const fetchLeads = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/leads`);
            setLeads(res.data.leads || []);
        } catch (err) {
            console.error('[Dashboard] Error fetching leads:', err);
        }
    }, []);

    const fetchPendingRequests = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/agent/pending-requests`);
            setPendingRequests(res.data.requests || []);
        } catch (err) {
            console.error('[Dashboard] Error fetching requests:', err);
        }
    }, []);

    const fetchNewCount = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/leads/new-count`);
            setNewCount(res.data.new_count || 0);
        } catch { }
    }, []);

    const fetchBookings = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/bookings`);
            setBookings(res.data.bookings || []);
        } catch (err) {
            console.error('[Dashboard] Error fetching bookings:', err);
        }
    }, []);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/settings`);
            if (res.data && res.data.settings) {
                setChatbotSettings(res.data.settings);
            }
        } catch (err) {
            console.error('[Dashboard] Error fetching settings:', err);
        }
    }, []);

    const updateSettings = async (newProvider) => {
        const newSettings = { ...chatbotSettings, tts_provider: newProvider };
        setChatbotSettings(newSettings);
        try {
            await axios.post(`${API_URL}/api/settings`, newSettings);
        } catch (err) {
            console.error('[Dashboard] Error updating settings:', err);
        }
    };

    // Setup Axios Authorization Header & Interceptor
    useEffect(() => {
        if (agentInfo?.token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${agentInfo.token}`;
        }

        const interceptor = axios.interceptors.response.use(
            response => response,
            error => {
                if (error.response?.status === 401) {
                    // Token expired or invalid
                    console.warn('[Session] Token expired or invalid. Logging out.');
                    delete axios.defaults.headers.common['Authorization'];
                    onLogout();
                }
                return Promise.reject(error);
            }
        );

        return () => {
            axios.interceptors.response.eject(interceptor);
        };
    }, [agentInfo, onLogout]);

    // WebSocket connection
    useEffect(() => {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = API_URL ? new URL(API_URL).host : window.location.host;
        const wsUrl = `${wsProtocol}//${wsHost}/ws/dashboard`;

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;
            ws.onopen = () => setWsConnected(true);
            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'new_lead') {
                    playNotificationSound();
                    setLeads(prev => {
                        const filtered = prev.filter(l => l.session_id !== data.lead.session_id);
                        return [data.lead, ...filtered];
                    });
                    setNewCount(prev => prev + 1);
                    if (Notification.permission === 'granted') {
                        new Notification('🔔 New Lead!', {
                            body: `${data.lead.name} - ${data.lead.email}`,
                            icon: '/smartchat-icon.png',
                        });
                    }
                } else if (data.type === 'chat_request') {
                    playNotificationSound();
                    fetchPendingRequests();
                } else if (data.type === 'new_booking') {
                    playNotificationSound();
                    fetchBookings();
                    if (Notification.permission === 'granted') {
                        new Notification('📅 New Booking!', {
                            body: `${data.booking.date} at ${data.booking.time}`,
                        });
                    }
                } else if (data.type === 'request_accepted') {
                    fetchPendingRequests();
                    fetchLeads();
                } else if (data.type === 'new_message') {
                    if (data.role === 'user') {
                        setLeads(prev => prev.map(l => l.session_id === data.session_id
                            ? { ...l, last_message: data.preview, message_count: (l.message_count || 0) + 1 }
                            : l));
                    }
                    // Auto-refresh chat if we're viewing this lead
                    setSelectedLead(current => {
                        if (current?.session_id === data.session_id) {
                            viewChatSilent(data.session_id);
                        }
                        return current;
                    });
                } else if (data.type === 'agent_takeover') {
                    setLeads(prev => prev.map(l => l.session_id === data.session_id
                        ? { ...l, assigned_agent: data.agent_name, status: 'assigned' }
                        : l));
                } else if (data.type === 'session_ended') {
                    setLeads(prev => prev.map(l => l.session_id === data.session_id
                        ? { ...l, assigned_agent: null, status: 'closed' }
                        : l));
                } else if (data.type === 'lead_deleted') {
                    setLeads(prev => prev.filter(l => l.session_id !== data.session_id));
                    setSelectedLead(current => current?.session_id === data.session_id ? null : current);
                }
            };
            ws.onclose = () => setWsConnected(false);
            const heartbeat = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' }));
            }, 30000);
            return () => { clearInterval(heartbeat); ws.close(); wsRef.current = null; };
        } catch (e) {
            console.error('[Dashboard WS] Error:', e);
        }
    }, []);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        fetchLeads();
        fetchNewCount();
        fetchPendingRequests();
        fetchBookings();
        fetchSettings();
        pollRef.current = setInterval(() => { fetchLeads(); fetchNewCount(); fetchPendingRequests(); fetchBookings(); fetchSettings(); }, 15000);
        return () => clearInterval(pollRef.current);
    }, [fetchLeads, fetchNewCount, fetchPendingRequests, fetchBookings, fetchSettings]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            setContextMenu({ visible: false, x: 0, y: 0, lead: null });
            if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest('.sd-hamburger-btn')) {
                setIsMenuOpen(false);
            }
        };
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

    const selectLead = async (lead) => {
        setSelectedLead(lead);
        setChatLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/chat-history/${lead.session_id}`);
            setChatHistory(res.data.messages || []);
        } catch { setChatHistory([]); }
        finally { setChatLoading(false); }
    };

    const viewChatSilent = async (sessionId) => {
        try {
            const res = await axios.get(`${API_URL}/api/chat-history/${sessionId}`);
            setChatHistory(res.data.messages || []);
        } catch { }
    };

    const handleAcceptRequest = async (req) => {
        try {
            await axios.post(`${API_URL}/api/agent/accept-chat`, {
                request_id: req.request_id,
                agent_name: agentName,
                agent_email: agentEmail,
                session_id: req.session_id,
            });
            fetchPendingRequests();
            fetchLeads();
            // Auto-open chat with this lead
            const res = await axios.get(`${API_URL}/api/leads`);
            const updatedLeads = res.data.leads || [];
            setLeads(updatedLeads);
            const lead = updatedLeads.find(l => l.session_id === req.session_id);
            if (lead) selectLead(lead);
        } catch (err) { console.error('[Accept] Error:', err); }
    };

    const handleTakeover = async (sessionId) => {
        try {
            await axios.post(`${API_URL}/api/agent/takeover`, {
                agent_name: agentName,
                session_id: sessionId,
            });
            fetchLeads();
            if (selectedLead?.session_id === sessionId) viewChatSilent(sessionId);
        } catch (err) { console.error(err); }
    };

    const handleEndSession = async (sessionId) => {
        try {
            await axios.post(`${API_URL}/api/agent/end-session`, {
                agent_name: agentName,
                session_id: sessionId,
            });
            fetchLeads();
            if (selectedLead?.session_id === sessionId) viewChatSilent(sessionId);
        } catch (err) { console.error(err); }
    };

    const sendAgentMsg = async () => {
        if (!agentMessage.trim() || !selectedLead) return;

        // Auto-takeover if not assigned yet
        if (!selectedLead.assigned_agent) {
            await handleTakeover(selectedLead.session_id);
        }

        try {
            await axios.post(`${API_URL}/api/agent/message`, {
                session_id: selectedLead.session_id,
                agent_name: agentName,
                message: agentMessage,
            });
            setAgentMessage('');
            viewChatSilent(selectedLead.session_id);
        } catch (err) { console.error(err); }
    };

    const handleLogout = async () => {
        try {
            await axios.post(`${API_URL}/api/agent/logout?email=${encodeURIComponent(agentEmail)}`);
        } catch { }
        delete axios.defaults.headers.common['Authorization'];
        onLogout();
    };

    const handleLabelUpdate = async (sessionId, label) => {
        try {
            await axios.post(`${API_URL}/api/lead/${sessionId}/label`, { label });
            setLeads(prev => prev.map(l => l.session_id === sessionId ? { ...l, label } : l));
            setEditingLabel(null);
            setLabelInput('');
        } catch (err) { console.error('[Label] Error:', err); }
    };

    const handleContextMenu = (e, lead) => {
        e.preventDefault();
        setContextMenu({
            visible: true,
            x: e.pageX,
            y: e.pageY,
            lead
        });
    };

    const handleDeleteChat = async (sessionId) => {
        if (!window.confirm('Are you sure you want to delete this chat history? This action cannot be undone.')) return;
        try {
            await axios.delete(`${API_URL}/api/lead/${sessionId}`);
            setLeads(prev => prev.filter(l => l.session_id !== sessionId));
            if (selectedLead?.session_id === sessionId) setSelectedLead(null);
            setContextMenu({ visible: false, x: 0, y: 0, lead: null });
        } catch (err) {
            console.error('[Delete] Error:', err);
            alert('Failed to delete chat.');
        }
    };

    // Active chats: leads with messages (sorted by activity)
    const activeChats = leads.filter(l => l.status !== 'closed' && l.message_count > 0);
    // Past chats: closed sessions
    const pastChats = leads.filter(l => l.status === 'closed' && l.message_count > 0);

    return (
        <div className="sd-layout">
            {/* ── Left Sidebar ── */}
            <aside className="sd-sidebar">
                <div className="sd-sidebar-header">
                    <h2 className="sd-sidebar-title">Sales Dashboard</h2>
                    <div className="sd-sidebar-bell">
                        <Bell size={18} />
                        {(newCount + pendingRequests.length) > 0 && (
                            <span className="sd-bell-badge">{newCount + pendingRequests.length}</span>
                        )}
                    </div>
                </div>

                {/* Pending Requests */}
                {pendingRequests.length > 0 && (
                    <div className="sd-pending-section">
                        <h4 className="sd-section-label">🔔 Incoming Requests</h4>
                        {pendingRequests.map((req) => (
                            <div key={req.request_id} className="sd-pending-item">
                                <div className="sd-pending-info">
                                    <span className="sd-pending-name">{req.user_name || 'User'}</span>
                                    <span className="sd-pending-email">{req.user_email || ''}</span>
                                </div>
                                <button className="sd-accept-btn" onClick={() => handleAcceptRequest(req)}>
                                    <CheckCircle size={14} />
                                    Accept
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Bookings Section removed from here to Top Menu */}

                <h4 className="sd-section-label">Active Chats</h4>

                <div className="sd-chat-list">
                    {activeChats.length === 0 ? (
                        <p className="sd-no-chats">No active chats</p>
                    ) : (
                        activeChats.map((lead) => (
                            <div
                                key={lead.session_id}
                                className={`sd-chat-item ${selectedLead?.session_id === lead.session_id ? 'active' : ''}`}
                                onClick={() => selectLead(lead)}
                            >
                                <div className="sd-chat-avatar">
                                    <MessageCircle size={16} />
                                </div>
                                <div className="sd-chat-info">
                                    <span className="sd-chat-name">{lead.name}</span>
                                    <span className="sd-chat-email">{lead.email}</span>
                                </div>
                                <span className={`sd-chat-dot ${lead.status === 'new' ? 'new' : lead.assigned_agent ? 'assigned' : ''}`} />
                            </div>
                        ))
                    )}
                </div>

                <h4 className="sd-section-label" style={{ marginTop: '8px' }}><Archive size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} />Past Chats</h4>

                <div className="sd-chat-list sd-past-chat-list">
                    {pastChats.length === 0 ? (
                        <p className="sd-no-chats">No past chats</p>
                    ) : (
                        pastChats.map((lead) => (
                            <div
                                key={lead.session_id}
                                className={`sd-chat-item past ${selectedLead?.session_id === lead.session_id ? 'active' : ''}`}
                                onClick={() => selectLead(lead)}
                                onContextMenu={(e) => handleContextMenu(e, lead)}
                            >
                                <div className="sd-chat-avatar past">
                                    <MessageCircle size={16} />
                                </div>
                                <div className="sd-chat-info">
                                    <span className="sd-chat-name">{lead.name}</span>
                                    {lead.label && <span className="sd-chat-label-tag">{lead.label}</span>}
                                    {!lead.label && <span className="sd-chat-email">{lead.email}</span>}
                                </div>
                                <span className="sd-chat-dot closed" />
                            </div>
                        ))
                    )}
                </div>

                <button className="sd-logout-btn" onClick={handleLogout}>
                    <LogOut size={16} />
                    Logout
                </button>
            </aside>

            {/* ── Top Right Expandable Menu ── */}
            <div className="sd-top-right-container">
                <button
                    className="sd-hamburger-btn"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(!isMenuOpen);
                    }}
                >
                    {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>

                {isMenuOpen && (
                    <div className="sd-expandable-menu" ref={menuRef}>
                        <div className="sd-menu-header">
                            <h4>Menu</h4>
                        </div>
                        <div className="sd-menu-section">
                            <h5>📅 Demo Bookings</h5>
                            {bookings.length === 0 ? (
                                <p className="sd-menu-empty">No upcoming bookings</p>
                            ) : (
                                <div className="sd-menu-list">
                                    {bookings.map((booking) => (
                                        <div key={booking.booking_id} className="sd-menu-item">
                                            <div className="sd-menu-item-info">
                                                <span className="sd-menu-item-primary">{booking.date} at {booking.time}</span>
                                                <span className="sd-menu-item-secondary">{booking.user_name || 'User'} ({booking.user_email || 'No email'})</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="sd-menu-section">
                            <h5>⚙️ Chatbot Settings</h5>
                            <div className="sd-toggle-row">
                                <span>Use Web Speech API (Local TTS)</span>
                                <label className="sd-switch">
                                    <input
                                        type="checkbox"
                                        checked={chatbotSettings?.tts_provider === 'web-api'}
                                        onChange={(e) => updateSettings(e.target.checked ? 'web-api' : 'edge-tts')}
                                    />
                                    <span className="sd-slider round"></span>
                                </label>
                            </div>
                        </div>
                        <div className="sd-menu-section sd-menu-future">
                            <h5> Future Features</h5>
                            <p className="sd-menu-placeholder">More tools coming soon...</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── Right Chat Panel ── */}
            <main className="sd-chat-panel">
                {!selectedLead ? (
                    <div className="sd-empty-chat">
                        <MessageCircle size={48} strokeWidth={1} />
                        <p>Select a chat from the sidebar to start messaging</p>
                    </div>
                ) : (
                    <>
                        <div className="sd-chat-header">
                            <div>
                                <h3>Chat with {selectedLead.name}</h3>
                                {selectedLead.status === 'closed' && (
                                    <div className="sd-label-row">
                                        {editingLabel === selectedLead.session_id ? (
                                            <form className="sd-label-form" onSubmit={(e) => { e.preventDefault(); handleLabelUpdate(selectedLead.session_id, labelInput); }}>
                                                <input
                                                    className="sd-label-input"
                                                    placeholder="e.g. Follow-up, Interested"
                                                    value={labelInput}
                                                    onChange={(e) => setLabelInput(e.target.value)}
                                                    autoFocus
                                                />
                                                <button type="submit" className="sd-label-save-btn">Save</button>
                                                <button type="button" className="sd-label-cancel-btn" onClick={() => { setEditingLabel(null); setLabelInput(''); }}>Cancel</button>
                                            </form>
                                        ) : (
                                            <button className="sd-label-btn" onClick={() => { setEditingLabel(selectedLead.session_id); setLabelInput(selectedLead.label || ''); }}>
                                                <Tag size={13} />
                                                {selectedLead.label || 'Add Label'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="sd-chat-header-actions">
                                {selectedLead.status === 'closed' ? (
                                    <span className="sd-assigned-tag" style={{ background: '#f3f4f6', color: '#6b7280' }}>Session Closed</span>
                                ) : !selectedLead.assigned_agent ? (
                                    <>
                                        <button className="sd-join-btn" onClick={() => handleTakeover(selectedLead.session_id)}>
                                            Join Chat
                                        </button>
                                        <button className="sd-leave-btn" style={{ marginLeft: '8px' }} onClick={() => handleEndSession(selectedLead.session_id)}>
                                            End Session
                                        </button>
                                    </>
                                ) : selectedLead.assigned_agent.toLowerCase() === agentName.toLowerCase() ? (
                                    <button className="sd-leave-btn" onClick={() => handleEndSession(selectedLead.session_id)}>
                                        End Session
                                    </button>
                                ) : (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span className="sd-assigned-tag">Assigned to {selectedLead.assigned_agent}</span>
                                        <button className="sd-join-btn" style={{ padding: '0.2rem 0.5rem', fontSize: '0.7rem' }} onClick={() => handleTakeover(selectedLead.session_id)}>
                                            Takeover
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="sd-messages">
                            {chatLoading ? (
                                <div className="sd-chat-loading">Loading messages...</div>
                            ) : chatHistory.length === 0 ? (
                                <div className="sd-chat-loading">No messages yet</div>
                            ) : (
                                chatHistory.map((msg, i) => (
                                    <div key={i} className={`sd-msg ${msg.role}`}>
                                        <div className="sd-msg-bubble">
                                            {msg.role === 'agent' && <span className="sd-msg-agent-name">{msg.agent_name}</span>}
                                            {msg.role === 'system' ? (
                                                <em>{msg.content}</em>
                                            ) : (
                                                <p>{msg.content}</p>
                                            )}
                                            <span className="sd-msg-time">
                                                {msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                            <div ref={chatEndRef} />
                        </div>

                        <div className="sd-input-bar">
                            <input
                                type="text"
                                className="sd-input"
                                placeholder="Type a message..."
                                value={agentMessage}
                                onChange={(e) => setAgentMessage(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendAgentMsg()}
                            />
                            <button className="sd-send-btn" onClick={sendAgentMsg} disabled={!agentMessage.trim()}>
                                Send
                            </button>
                        </div>
                    </>
                )}
            </main>

            {/* ── Context Menu ── */}
            {contextMenu.visible && (
                <div
                    className="sd-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        className="sd-context-menu-item delete"
                        onClick={() => handleDeleteChat(contextMenu.lead.session_id)}
                    >
                        Delete Chat
                    </button>
                    <button
                        className="sd-context-menu-item"
                        onClick={() => setContextMenu({ visible: false, x: 0, y: 0, lead: null })}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
};

export default SalesDashboard;
