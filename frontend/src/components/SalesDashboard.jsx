import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
    Users, Search, RefreshCcw, ChevronDown, Clock, UserCheck, XCircle,
    MessageSquare, Mail, Phone, ArrowLeft, Bell, Send, Headphones, ExternalLink,
    Download, LogOut, Volume2, VolumeX, Hash, Globe, User
} from 'lucide-react';
import './SalesDashboard.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

const STATUS_CONFIG = {
    new: { label: 'New', color: '#3b82f6', bg: '#eff6ff', icon: Clock },
    assigned: { label: 'Assigned', color: '#f59e0b', bg: '#fffbeb', icon: UserCheck },
    closed: { label: 'Closed', color: '#10b981', bg: '#ecfdf5', icon: XCircle },
};

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

const SalesDashboard = ({ onBack }) => {
    const [leads, setLeads] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [newCount, setNewCount] = useState(0);
    const [expandedLead, setExpandedLead] = useState(null);
    const [chatHistory, setChatHistory] = useState([]);
    const [chatLoading, setChatLoading] = useState(false);
    const [agentMessage, setAgentMessage] = useState('');
    const [agentName, setAgentName] = useState('');
    const [showAgentInput, setShowAgentInput] = useState(false);
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [liveIndicator, setLiveIndicator] = useState(false);
    const [wsConnected, setWsConnected] = useState(false);
    const pollRef = useRef(null);
    const wsRef = useRef(null);
    const chatEndRef = useRef(null);

    const fetchLeads = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/leads`);
            setLeads(res.data.leads || []);
        } catch (err) {
            console.error('[Dashboard] Error fetching leads:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchNewCount = useCallback(async () => {
        try {
            const res = await axios.get(`${API_URL}/api/leads/new-count`);
            setNewCount(res.data.new_count || 0);
        } catch { }
    }, []);

    // WebSocket logic
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
                    setLiveIndicator(true);
                    setTimeout(() => setLiveIndicator(false), 3000);
                    if (soundEnabled) playNotificationSound();
                    if (Notification.permission === 'granted') {
                        new Notification('🔔 New Lead!', {
                            body: `${data.lead.name} - ${data.lead.email}`,
                            icon: '/smartchat-icon.png',
                        });
                    }
                    setLeads(prev => [data.lead, ...prev]);
                    setNewCount(prev => prev + 1);
                } else if (data.type === 'status_changed') {
                    setLeads(prev => prev.map(l => l.session_id === data.session_id ? { ...l, status: data.status } : l));
                    fetchNewCount();
                } else if (data.type === 'new_message') {
                    if (data.role === 'user') {
                        setLeads(prev => prev.map(l => l.session_id === data.session_id ? { ...l, last_message: data.preview, message_count: (l.message_count || 0) + 1 } : l));
                    }
                    if (expandedLead === data.session_id) viewChatSilent(data.session_id);
                } else if (data.type === 'agent_takeover') {
                    setLeads(prev => prev.map(l => l.session_id === data.session_id ? { ...l, assigned_agent: data.agent_name, status: 'assigned' } : l));
                } else if (data.type === 'session_ended') {
                    setLeads(prev => prev.map(l => l.session_id === data.session_id ? { ...l, assigned_agent: null, status: 'closed' } : l));
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
    }, [soundEnabled, expandedLead]);

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
        fetchLeads();
        fetchNewCount();
        pollRef.current = setInterval(() => { fetchLeads(); fetchNewCount(); }, 30000);
        return () => clearInterval(pollRef.current);
    }, [fetchLeads, fetchNewCount]);

    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatHistory]);

    const updateStatus = async (sessionId, newStatus) => {
        try {
            await axios.post(`${API_URL}/api/lead/${sessionId}/status`, { status: newStatus });
            setLeads(prev => prev.map(l => l.session_id === sessionId ? { ...l, status: newStatus } : l));
        } catch (err) { console.error(err); }
    };

    const viewChat = async (sessionId) => {
        if (expandedLead === sessionId) { setExpandedLead(null); return; }
        setExpandedLead(sessionId);
        setChatLoading(true);
        try {
            const res = await axios.get(`${API_URL}/api/chat-history/${sessionId}`);
            setChatHistory(res.data.messages || []);
        } catch (err) { setChatHistory([]); } finally { setChatLoading(false); }
    };

    const viewChatSilent = async (sessionId) => {
        try {
            const res = await axios.get(`${API_URL}/api/chat-history/${sessionId}`);
            setChatHistory(res.data.messages || []);
        } catch { }
    };

    const handleAgentTakeover = async (sessionId) => {
        if (!agentName.trim()) { setShowAgentInput(true); return; }
        try {
            await axios.post(`${API_URL}/api/agent/takeover`, { agent_name: agentName, session_id: sessionId });
            fetchLeads();
        } catch (err) { console.error(err); }
    };

    const handleEndSession = async (sessionId) => {
        if (!agentName.trim()) { setShowAgentInput(true); return; }
        try {
            await axios.post(`${API_URL}/api/agent/end-session`, { agent_name: agentName, session_id: sessionId });
            fetchLeads();
            if (expandedLead === sessionId) viewChatSilent(sessionId);
        } catch (err) { console.error(err); }
    };

    const sendAgentMsg = async (sessionId) => {
        if (!agentMessage.trim()) return;
        if (!agentName.trim()) { setShowAgentInput(true); return; }
        try {
            await axios.post(`${API_URL}/api/agent/message`, { session_id: sessionId, agent_name: agentName, message: agentMessage });
            setAgentMessage('');
            viewChatSilent(sessionId);
        } catch (err) { console.error(err); }
    };

    const handleExport = async () => {
        try {
            const res = await axios.get(`${API_URL}/api/leads/export`, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `leads_export_${new Date().toISOString().slice(0, 10)}.csv`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (err) { console.error(err); }
    };

    const filtered = leads.filter(lead => {
        const matchesSearch = !search || lead.name?.toLowerCase().includes(search.toLowerCase()) || lead.email?.toLowerCase().includes(search.toLowerCase()) || lead.phone?.includes(search);
        const matchesStatus = statusFilter === 'all' || lead.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const statusCounts = { all: leads.length, new: leads.filter(l => l.status === 'new').length, assigned: leads.filter(l => l.status === 'assigned').length, closed: leads.filter(l => l.status === 'closed').length };
    const formatDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const formatTimeAgo = (iso) => {
        if (!iso) return '';
        const diff = Math.floor((new Date() - new Date(iso)) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
        return `${Math.floor(diff / 86400)}d ago`;
    };

    return (
        <div className="dashboard-container">
            {/* Header */}
            <div className="dashboard-header">
                <div className="dashboard-header-left">
                    <button className="dashboard-back-btn" onClick={onBack} title="Back to Chat">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="dashboard-header-title-group">
                        <h1 className="dashboard-title">
                            <Users size={22} />
                            Sales Dashboard
                            {wsConnected && <span className={`live-badge ${liveIndicator ? 'pulse' : ''}`}><span className="live-dot" />LIVE</span>}
                        </h1>
                        <p className="dashboard-subtitle">{leads.length} total leads · <span className="subtitle-highlight">{statusCounts.new} new</span> · {statusCounts.assigned} active</p>
                    </div>
                </div>
                <div className="dashboard-header-right">
                    {newCount > 0 && <div className="dashboard-notification"><Bell size={16} /><span className="notification-badge">{newCount}</span><span className="notification-text">New</span></div>}
                    <button className={`dashboard-sound-btn ${soundEnabled ? 'active' : ''}`} onClick={() => setSoundEnabled(v => !v)} title={soundEnabled ? 'Mute' : 'Unmute'}>{soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
                    <button className="dashboard-export-btn" onClick={handleExport} title="Export CSV"><Download size={16} /><span className="export-label">Export</span></button>
                    <button className="dashboard-refresh-btn" onClick={() => { setLoading(true); fetchLeads(); }} title="Refresh"><RefreshCcw size={16} className={loading ? 'spin' : ''} /></button>
                </div>
            </div>

            {/* Agent Setup Modal Overlay */}
            {showAgentInput && (
                <div className="agent-setup-overlay">
                    <div className="agent-setup-modal">
                        <div className="agent-setup-header">
                            <Headphones size={24} />
                            <h3>Identify Yourself</h3>
                        </div>
                        <p>Enter your agent name to start messaging users.</p>
                        <input
                            type="text"
                            placeholder="Your Name (e.g. Alex)"
                            value={agentName}
                            onChange={(e) => setAgentName(e.target.value)}
                            className="agent-setup-input"
                            autoFocus
                        />
                        <div className="agent-setup-footer">
                            <button className="agent-setup-cancel" onClick={() => setShowAgentInput(false)}>Cancel</button>
                            <button className="agent-setup-save" onClick={() => agentName.trim() && setShowAgentInput(false)} disabled={!agentName.trim()}>Save & Continue</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Filters */}
            <div className="dashboard-filters">
                <div className="dashboard-search-box">
                    <Search size={16} />
                    <input type="text" placeholder="Search leads..." value={search} onChange={(e) => setSearch(e.target.value)} className="dashboard-search-input" />
                    {search && <button className="search-clear" onClick={() => setSearch('')}><XCircle size={14} /></button>}
                </div>
                <div className="dashboard-status-filters">
                    <button className={`status-filter-btn ${statusFilter === 'all' ? 'active' : ''}`} onClick={() => setStatusFilter('all')}>All <span className="filter-count">{statusCounts.all}</span></button>
                    {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                        <button key={key} className={`status-filter-btn ${statusFilter === key ? 'active' : ''}`} onClick={() => setStatusFilter(key)} style={statusFilter === key ? { background: cfg.bg, color: cfg.color } : {}}>
                            {cfg.label} <span className="filter-count">{statusCounts[key]}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Table */}
            <div className="dashboard-table-wrapper">
                {loading ? <div className="dashboard-loading"><div className="dashboard-spinner" /><p>Loading leads...</p></div> : filtered.length === 0 ? <div className="dashboard-empty"><Users size={40} /><p>No leads found</p></div> : (
                    <table className="dashboard-table">
                        <thead><tr><th>Name</th><th>Contact</th><th>Last Message</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead>
                        <tbody>
                            {filtered.map((lead) => {
                                const cfg = STATUS_CONFIG[lead.status] || STATUS_CONFIG.new;
                                const isExpanded = expandedLead === lead.session_id;
                                return (
                                    <React.Fragment key={lead.session_id}>
                                        <tr className={`dashboard-row ${isExpanded ? 'expanded' : ''} ${lead.status === 'new' ? 'row-new' : ''}`}>
                                            <td><div className="lead-name-cell"><div className="lead-avatar">{lead.name?.charAt(0)?.toUpperCase()}</div><div className="lead-name-group"><span className="lead-name">{lead.name}</span>{lead.assigned_agent && <span className="lead-agent-tag"><Headphones size={10} /> {lead.assigned_agent}</span>}</div></div></td>
                                            <td><div className="lead-contact-cell"><a href={`mailto:${lead.email}`} className="lead-contact-item clickable"><Mail size={12} /> {lead.email}</a><a href={`tel:${lead.phone}`} className="lead-contact-item clickable"><Phone size={12} /> {lead.phone}</a></div></td>
                                            <td><div className="lead-message-cell"><span className="lead-message">{lead.last_message?.substring(0, 60)}</span>{lead.message_count > 0 && <span className="message-count-badge"><Hash size={10} />{lead.message_count}</span>}</div></td>
                                            <td><div className="status-dropdown-wrapper"><select className="status-select" value={lead.status} onChange={(e) => updateStatus(lead.session_id, e.target.value)} style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color + '40' }}><option value="new">🔵 New</option><option value="assigned">🟡 Assigned</option><option value="closed">🟢 Closed</option></select></div></td>
                                            <td><div className="lead-date-cell"><span className="lead-date">{formatDate(lead.created_at)}</span><span className="lead-time-ago">{formatTimeAgo(lead.created_at)}</span></div></td>
                                            <td>
                                                <div className="lead-actions">
                                                    <button className={`lead-action-btn chat-btn ${isExpanded ? 'active' : ''}`} onClick={() => viewChat(lead.session_id)} title="Open Messenger"><MessageSquare size={14} /></button>
                                                    {!lead.assigned_agent ? (
                                                        <button className="lead-action-btn takeover-btn" onClick={() => handleAgentTakeover(lead.session_id)} title="Join Chat"><Headphones size={14} /></button>
                                                    ) : (
                                                        <button className="lead-action-btn end-btn" onClick={() => handleEndSession(lead.session_id)} title="Leave Chat"><LogOut size={14} /></button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="chat-history-row">
                                                <td colSpan="6">
                                                    <div className="chat-history-panel">
                                                        <div className="chat-history-messages">
                                                            {chatHistory.map((msg, i) => (
                                                                <div key={i} className={`ch-msg ${msg.role}`}>
                                                                    <div className="ch-msg-content">
                                                                        {msg.role === 'agent' && <span className="ch-agent-name">{msg.agent_name}</span>}
                                                                        <p>{msg.content}</p>
                                                                        <span className="ch-msg-time">{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString() : ''}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                            <div ref={chatEndRef} />
                                                        </div>
                                                        {/* REAM-TIME MESSAGING INTERFACE */}
                                                        <div className="agent-reply-bar">
                                                            <div className="agent-reply-input-wrapper">
                                                                <input
                                                                    type="text"
                                                                    placeholder={agentName ? `Reply as ${agentName}...` : "Click 'Join Chat' or type here to identify yourself..."}
                                                                    value={agentMessage}
                                                                    onChange={(e) => setAgentMessage(e.target.value)}
                                                                    className="agent-reply-input"
                                                                    onKeyDown={(e) => e.key === 'Enter' && sendAgentMsg(lead.session_id)}
                                                                    onFocus={() => !agentName && setShowAgentInput(true)}
                                                                />
                                                                <button
                                                                    className="agent-reply-send"
                                                                    onClick={() => sendAgentMsg(lead.session_id)}
                                                                    disabled={!agentMessage.trim()}
                                                                >
                                                                    <Send size={16} />
                                                                </button>
                                                            </div>
                                                            {!lead.assigned_agent && (
                                                                <button className="reply-takeover-btn" onClick={() => handleAgentTakeover(lead.session_id)}>
                                                                    <Headphones size={14} /> Claim this chat
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="dashboard-footer">
                <span className="footer-stat"><span className="footer-stat-label">Leads:</span> <span className="footer-stat-value">{filtered.length}</span></span>
                <span className={`footer-ws-status ${wsConnected ? 'connected' : 'disconnected'}`}><Globe size={12} /> {wsConnected ? 'Connected' : 'Offline'}</span>
            </div>
        </div>
    );
};

export default SalesDashboard;
