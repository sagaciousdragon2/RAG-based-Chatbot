import React, { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import { Send, X, Bot, User, MessageCircle, Phone, Globe, Mic, Trash2, Volume2, VolumeX, Headphones } from 'lucide-react';
import { KeywordText } from './KeywordText';
import PreChatForm from './PreChatForm';
import BookingForm from './BookingForm';
import './ChatInterface.css';

// When VITE_API_URL is not set, use '' so API calls are relative to the
// current origin. This works perfectly when frontend is served by FastAPI
// (same port/ngrok URL). For local dev, set VITE_API_URL=http://localhost:8000
const API_URL = import.meta.env.VITE_API_URL ?? '';

// Required to bypass ngrok's browser interstitial warning page.
// Without this header, all API requests through ngrok return an HTML page
// instead of JSON, breaking the backend connection on remote devices.
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

const QUICK_ACTIONS = [
    { label: '🌐 Learn about our Services', query: 'What services does Walkout Tech offer?' },
    { label: '📅 Book a Free Consultation', query: 'How can I book a free consultation with Walkout Tech?' },
];

const stripMarkdown = (text) => {
    if (!text) return '';
    let cleaned = text
        .replace(/#{1,6}\s?/g, '')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/`[^`]+`/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '')
        .replace(/---/g, '')
        // Remove all emojis
        .replace(/[\u{1F300}-\u{1FFFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299\u00A9\u00AE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA]/gu, '')
        // Expand digit sequences (like phone numbers) to digit-by-digit: "9704" → "9 7 0 4"
        .replace(/\d[\d\s]{2,}\d/g, (match) => match.replace(/\d/g, (d) => d + ' ').replace(/\s+/g, ' ').trim())
        .replace(/\n{2,}/g, ' ')
        .replace(/\n/g, ' ')
        .trim();
    // Limit to 500 chars for TTS
    if (cleaned.length > 500) {
        cleaned = cleaned.substring(0, 500) + '...';
    }
    return cleaned;
};

// Recursively extract plain text from React children nodes
const extractText = (children) => {
    if (!children) return '';
    if (typeof children === 'string') return children;
    if (typeof children === 'number') return String(children);
    if (Array.isArray(children)) return children.map(extractText).join('');
    if (children?.props?.children) return extractText(children.props.children);
    return '';
};

// Split markdown content into chunks of ~3 lines each for multi-bubble rendering
const splitIntoBubbles = (content) => {
    if (!content) return [''];
    // Split on double newlines (paragraph breaks) first
    const paragraphs = content.split(/\n{2,}/);
    const chunks = [];
    let current = [];
    let lineCount = 0;

    for (const para of paragraphs) {
        const paraLines = para.split('\n').length;
        // If adding this paragraph would exceed 3 lines and we already have content, flush
        if (lineCount > 0 && lineCount + paraLines > 3) {
            chunks.push(current.join('\n\n'));
            current = [para];
            lineCount = paraLines;
        } else {
            current.push(para);
            lineCount += paraLines;
        }
        // If current chunk already has 3+ lines, flush it immediately
        if (lineCount >= 3) {
            chunks.push(current.join('\n\n'));
            current = [];
            lineCount = 0;
        }
    }
    if (current.length > 0) chunks.push(current.join('\n\n'));
    return chunks.filter(c => c.trim().length > 0);
};

// Split text into short TTS chunks (lines and sentences)
const splitForTts = (text) => {
    if (!text) return [];
    const normalized = text.replace(/\r/g, '').trim();
    if (!normalized) return [];

    const lines = normalized.split('\n').map(l => l.trim()).filter(Boolean);
    const chunks = [];

    for (const line of lines) {
        const cleanedLine = line.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, '');
        const sentences = cleanedLine.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
            const trimmed = sentence.trim();
            if (trimmed) chunks.push(trimmed);
        }
    }

    return chunks.length ? chunks : [normalized];
};

// Contact card with custom PNG icons — shown at most once per conversation
const ContactCard = () => (
    <div className="contact-card">
        <div className="contact-card-title">
            <span className="contact-icon-bg">
                <img src="/walkout-icon.png" alt="Walkout" className="contact-icon" />
            </span>
            Connect with our Sales Team
        </div>
        <a href="mailto:sales@walkouttech.com" className="contact-card-row">
            <img src="/email-icon.png" alt="Email" className="contact-icon" />
            <span>sales@walkouttech.com</span>
        </a>
        <a href="https://wa.me/919704970484" target="_blank" rel="noreferrer" className="contact-card-row">
            <img src="/whatsapp.png" alt="WhatsApp" className="contact-icon" />
            <span>9704&nbsp;9704&nbsp;84</span>
        </a>
    </div>
);

// Parse message content: strip tokens and return { text, showContact, showMoreInfo, showContactSales, showBooking }
const parseMessage = (content) => {
    const showContact = content.includes('##CONTACT_CARD##');
    const showMoreInfo = content.includes('##MORE_INFO##');
    const showContactSales = content.includes('##CONTACT_SALES##');
    const showBooking = content.includes('##BOOKING_FORM##');
    const text = content
        .replace(/##CONTACT_CARD##/g, '')
        .replace(/##MORE_INFO##/g, '')
        .replace(/##CONTACT_SALES##/g, '')
        .replace(/##BOOKING_FORM##/g, '')
        .trim();
    return { text, showContact, showMoreInfo, showContactSales, showBooking };
};

const ChatInterface = () => {
    const [open, setOpen] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    const [showPreChat, setShowPreChat] = useState(true);
    const [preChatLoading, setPreChatLoading] = useState(false);
    const [agentActive, setAgentActive] = useState(false);
    const [agentName, setAgentName] = useState(null);
    const [isTyping, setIsTyping] = useState(false);
    const [overflowMode, setOverflowMode] = useState(false);
    const [agentRequestPending, setAgentRequestPending] = useState(false);
    const [agentRequestStatus, setAgentRequestStatus] = useState(null); // null | 'pending' | 'no_agents'
    const [messages, setMessages] = useState([
        { role: 'assistant', content: "Hi there! I'm **Smartchat**, your Walkout Tech assistant.\n\nHow can I help you today?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isConnected, setIsConnected] = useState(null);
    const [showContact, setShowContact] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [autoSpeak, setAutoSpeak] = useState(true);
    const [globalSettings, setGlobalSettings] = useState({ tts_provider: 'edge-tts' });

    // Track if the contact card has already been shown this session (show only once)
    const contactShownRef = useRef(false);

    const messagesEndRef = useRef(null);
    const recognitionRef = useRef(null);
    const audioRef = useRef(null);
    const sendMessageRef = useRef(null); // ref so toggleListening can call it without dep-array issues
    const lastUserQueryRef = useRef('');
    const lastAssistantAnswerRef = useRef('');
    const salesOfferRef = useRef(false);
    const usedMoreInfoRef = useRef(new Set());
    const wsRef = useRef(null);

    const ttsStopRef = useRef(false);

    // ── Fetch Settings ──
    useEffect(() => {
        axios.get(`${API_URL}/api/settings`)
            .then(res => {
                if (res.data?.settings) setGlobalSettings(res.data.settings);
            })
            .catch(err => console.error('[Settings] Fetch error:', err));
    }, []);

    // ── WebSocket Connection ──
    useEffect(() => {
        if (!sessionId) return;

        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = API_URL ? new URL(API_URL).host : window.location.host;
        const wsUrl = `${wsProtocol}//${wsHost}/ws/chat/${sessionId}`;

        try {
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === 'agent_joined') {
                    setAgentActive(true);
                    setAgentName(data.agent_name);
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `🎧 **${data.agent_name}** has joined the chat.`
                    }]);
                } else if (data.type === 'agent_left') {
                    setAgentActive(false);
                    setAgentName(null);
                    setIsTyping(false);
                    setMessages(prev => [...prev, {
                        role: 'system',
                        content: `👋 **${data.agent_name}** has ended the session. You're now chatting with SmartChat bot.`
                    }]);
                } else if (data.type === 'agent_message') {
                    setMessages(prev => [...prev, {
                        role: 'agent',
                        content: data.content,
                        agent_name: data.agent_name,
                    }]);
                } else if (data.type === 'typing') {
                    if (data.role === 'agent') {
                        setIsTyping(data.is_typing);
                    }
                }
            };

            ws.onclose = () => {
                console.log('[WS] Connection closed');
            };

            ws.onerror = (err) => {
                console.error('[WS] Error:', err);
            };

            return () => {
                ws.close();
                wsRef.current = null;
            };
        } catch (e) {
            console.error('[WS] Failed to connect:', e);
        }
    }, [sessionId]);

    // ── Pre-Chat Form Submission ──
    const handleStartChat = async (formData) => {
        setPreChatLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/start-chat`, formData);
            const returnedSessionId = res.data.session_id;
            setSessionId(returnedSessionId);
            setUserInfo(formData);
            setShowPreChat(false);

            // Fetch any existing chat history for this session
            const historyRes = await axios.get(`${API_URL}/api/chat-history/${returnedSessionId}`);
            if (historyRes.data.messages && historyRes.data.messages.length > 0) {
                setMessages(historyRes.data.messages);
                // Automatically scroll into view and prevent initial TTS logic
            } else {
                // Personalize greeting for a completely new chat
                const firstName = formData.name.split(' ')[0];
                setMessages([
                    { role: 'assistant', content: `Hi **${firstName}**! 👋 I'm **Smartchat**, your Walkout Tech assistant.\n\nHow can I help you today?` }
                ]);
            }
        } catch (err) {
            console.error('[PreChat] Error:', err);
            alert('Failed to start chat. Please try again.');
        } finally {
            setPreChatLoading(false);
        }
    };

    // Fetch audio blob for a single text chunk
    const fetchAudioBlob = useCallback(async (plainText) => {
        const res = await axios.post(`${API_URL}/speak`,
            { message: plainText },
            { responseType: 'blob' }
        );
        return res.data;
    }, []);

    // Play a blob and resolve when playback ends (or rejects on error)
    const playBlob = useCallback((blob) => {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audioRef.current = audio;
            audio.oncanplay = () => audio.play().catch(reject);
            audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; resolve(); };
            audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; reject(audio.error); };
        });
    }, []);

    // Sequential per-chunk TTS: plays chunk 1 immediately, pre-fetches next while playing
    const speakChunks = useCallback(async (chunks) => {
        if (!chunks || chunks.length === 0) return;
        ttsStopRef.current = false;

        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        setIsSpeaking(true);

        if (globalSettings.tts_provider === 'web-api') {
            if (window.speechSynthesis.speaking) {
                window.speechSynthesis.cancel();
            }
            try {
                for (let i = 0; i < chunks.length; i++) {
                    if (ttsStopRef.current) break;
                    const currentText = stripMarkdown(chunks[i]);
                    if (!currentText.trim()) continue;

                    await new Promise((resolve) => {
                        const utterance = new SpeechSynthesisUtterance(currentText);
                        utterance.onend = resolve;
                        utterance.onerror = resolve;
                        window.speechSynthesis.speak(utterance);
                    });
                }
            } finally {
                setIsSpeaking(false);
            }
            return;
        }

        try {
            const firstText = stripMarkdown(chunks[0]);
            if (!firstText.trim()) return;

            // Pre-fetch first chunk immediately
            let nextBlobPromise = fetchAudioBlob(firstText);

            for (let i = 0; i < chunks.length; i++) {
                if (ttsStopRef.current) break;

                const currentText = stripMarkdown(chunks[i]);
                if (!currentText.trim()) continue;

                // Start pre-fetching the next chunk in parallel
                if (i + 1 < chunks.length) {
                    const nextText = stripMarkdown(chunks[i + 1]);
                    const prefetch = nextText.trim() ? fetchAudioBlob(nextText) : Promise.resolve(null);
                    const blob = await nextBlobPromise;
                    nextBlobPromise = prefetch;
                    if (!ttsStopRef.current && blob) await playBlob(blob);
                } else {
                    // Last chunk — just play it
                    const blob = await nextBlobPromise;
                    if (!ttsStopRef.current && blob) await playBlob(blob);
                }
            }
        } catch (e) {
            console.error('[TTS] Error:', e);
        } finally {
            setIsSpeaking(false);
            audioRef.current = null;
        }
    }, [fetchAudioBlob, playBlob, globalSettings.tts_provider]);

    // Kept for backward compat; wraps single text as one chunk
    const speakText = useCallback((text) => {
        if (!text) return Promise.resolve();
        return speakChunks([text]);
    }, [speakChunks]);

    const stopSpeaking = useCallback(() => {
        ttsStopRef.current = true;
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current = null;
        }
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
    }, []);

    const toggleListening = useCallback(() => {
        if (isListening) {
            // Stop listening
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.continuous = false;

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            // Auto-send the voice transcript immediately via ref (avoids dep-array crash)
            setInput(transcript);
            sendMessageRef.current?.(transcript);
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    }, [isListening]);

    useEffect(() => {
        if (open) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading, open, isTyping]);

    useEffect(() => {
        if (!open) {
            stopSpeaking();
        }
    }, [open, stopSpeaking]);

    useEffect(() => {
        axios.get(`${API_URL}/health`).then(() => setIsConnected(true)).catch(() => setIsConnected(false));
    }, []);

    const sendMessage = useCallback(async (text) => {
        if (!text.trim() || isLoading) return;
        const moreInfoIntent = /^(yes|yep|yeah|more info|more details|tell me more|details)$/i.test(text.trim());
        let queryToSend = text;

        if (moreInfoIntent) {
            if (salesOfferRef.current) {
                queryToSend = 'connect me to your sales team';
            } else if (lastUserQueryRef.current) {
                const prevAnswer = lastAssistantAnswerRef.current ? `\nPrevious answer: ${lastAssistantAnswerRef.current}` : '';
                queryToSend = `More details about: ${lastUserQueryRef.current}${prevAnswer}`;
            }
        } else {
            lastUserQueryRef.current = text;
            salesOfferRef.current = false;
        }
        stopSpeaking();
        const userMsg = { role: 'user', content: text };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsLoading(true);

        // Send typing indicator via WS
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'typing', role: 'user', is_typing: true }));
        }

        try {
            const res = await axios.post(`${API_URL}/chat`, {
                message: queryToSend,
                session_id: sessionId
            });
            const responseText = res.data.response;

            // Check if agent is active
            if (responseText === '__AGENT_ACTIVE__') {
                // Don't show AI response — agent is handling
                return;
            }

            const { text: cleanText, showContact: needsCard } = parseMessage(responseText);
            lastAssistantAnswerRef.current = cleanText;
            const lowerClean = cleanText.toLowerCase();
            salesOfferRef.current = lowerClean.includes('connect you to our sales team') ||
                lowerClean.includes('sales team');
            // Mark contact card as shown if this response requests it
            if (needsCard && !contactShownRef.current) {
                contactShownRef.current = true;
            }

            // Check for overflow (agent busy) scenario
            if (lowerClean.includes('all agents are busy') || lowerClean.includes('no agents available')) {
                setOverflowMode(true);
            }

            setMessages(prev => [...prev, { role: 'assistant', content: responseText }]);
            if (autoSpeak) {
                // TTS uses clean text (no ##CONTACT_CARD## token)
                const chunks = splitForTts(cleanText);
                speakChunks(chunks).catch(err => console.error('[TTS] Error:', err));
            }
        } catch (err) {
            console.error('[Chat] Error:', err);
            setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
        } finally {
            setIsLoading(false);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'typing', role: 'user', is_typing: false }));
            }
        }
    }, [isLoading, autoSpeak, stopSpeaking, speakChunks, sessionId]);

    // Keep ref in sync so toggleListening always calls the latest sendMessage
    sendMessageRef.current = sendMessage;

    // Request to talk to a live agent
    const requestAgent = async () => {
        if (!sessionId || agentRequestPending) return;
        setAgentRequestPending(true);
        try {
            const res = await axios.post(`${API_URL}/api/agent/request-chat`, {
                session_id: sessionId,
            });
            if (res.data.status === 'no_agents') {
                setAgentRequestStatus('no_agents');
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: 'No agents are currently online. Please contact us via our other channels. ##CONTACT_CARD##'
                }]);
                contactShownRef.current = true;
            } else if (res.data.status === 'pending' || res.data.status === 'already_pending') {
                setAgentRequestStatus('pending');
                setMessages(prev => [...prev, {
                    role: 'system',
                    content: '🔔 Your request to talk to an agent has been sent. Please wait while an agent accepts your chat...'
                }]);
            }
        } catch (err) {
            console.error('[AgentRequest] Error:', err);
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Sorry, we couldn\'t connect you to an agent right now. Please try again. ##CONTACT_CARD##'
            }]);
        } finally {
            setAgentRequestPending(false);
        }
    };

    const handleSend = (e) => { e.preventDefault(); sendMessage(input); };
    const handleQuickAction = (query) => sendMessage(query);

    const showQuickActions = messages.length <= 1 && !isLoading;

    const handleClearChat = () => {
        setMessages([
            { role: 'assistant', content: "Hi there! I'm **Smartchat**, your Walkout Tech assistant.\n\nHow can I help you today?" }
        ]);
        setInput('');
        contactShownRef.current = false;
        setAgentActive(false);
        setAgentName(null);
        setOverflowMode(false);
        setAgentRequestStatus(null);
    };

    return (
        <>
            {/* Chat Widget */}
            {open && (
                <div className="widget-container">
                    {/* Header */}
                    <div className="widget-header">
                        <div className="widget-header-left">
                            <div className="widget-avatar">
                                <img src="/smartchat-icon.png" alt="Smart Chat" className="widget-avatar-img" />
                            </div>
                            <div>
                                <div className="widget-title">Smart Chat</div>
                                <div className="widget-subtitle">
                                    {agentActive ? (
                                        <>
                                            <Headphones size={10} />
                                            <span className="widget-dot online" />
                                            {agentName || 'Agent'}
                                        </>
                                    ) : (
                                        <>
                                            <span className={`widget-dot ${isConnected ? 'online' : 'offline'}`} />
                                            {isConnected ? 'Online' : 'Offline'}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="widget-header-actions">
                            {!showPreChat && (
                                <>
                                    <button
                                        className={`widget-icon-btn volume-btn ${autoSpeak ? 'active' : ''}`}
                                        title={autoSpeak ? 'Disable auto-speak' : 'Enable auto-speak'}
                                        onClick={() => setAutoSpeak(v => {
                                            if (v) stopSpeaking(); // Stop any playing audio immediately when muting
                                            return !v;
                                        })}
                                    >
                                        {autoSpeak ? <Volume2 size={15} /> : <VolumeX size={15} />}
                                    </button>
                                    <button className="widget-icon-btn clear-btn" title="Clear Chat" onClick={handleClearChat} disabled={isLoading || messages.length <= 1}>
                                        <Trash2 size={15} />
                                    </button>
                                    <button className="widget-icon-btn phone-btn" title="Contact" onClick={() => setShowContact(v => !v)}>
                                        <Phone size={15} />
                                    </button>
                                </>
                            )}
                            <button className="widget-icon-btn" onClick={() => setOpen(false)} title="Close">
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Show Pre-Chat Form or Chat */}
                    {showPreChat ? (
                        <PreChatForm onStartChat={handleStartChat} isLoading={preChatLoading} />
                    ) : (
                        <>
                            {/* Contact Dropdown */}
                            {showContact && (
                                <div className="widget-contact-bar">
                                    <a href="mailto:sales@walkouttech.com" className="wc-item">
                                        <img src="/email-icon.png" alt="Email" className="wc-icon" /> sales@walkouttech.com
                                    </a>
                                    <a href="https://wa.me/919704970484" target="_blank" rel="noreferrer" className="wc-item">
                                        <img src="/whatsapp.png" alt="WhatsApp" className="wc-icon" /> 9704 9704 84
                                    </a>
                                </div>
                            )}

                            {/* Agent Active Banner */}
                            {agentActive && (
                                <div className="agent-active-banner">
                                    <Headphones size={14} />
                                    <span>Live agent <strong>{agentName}</strong> is assisting you</span>
                                </div>
                            )}

                            {/* Messages */}
                            <div className="widget-messages">
                                {messages.map((msg, idx) => {
                                    // System messages (agent joined, etc.)
                                    if (msg.role === 'system') {
                                        return (
                                            <div key={idx} className="wm-system">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>
                                        );
                                    }

                                    // Agent messages
                                    if (msg.role === 'agent') {
                                        const { text: cleanContent, showContact } = parseMessage(msg.content);
                                        const isFirstContactMsg = showContact &&
                                            !messages.slice(0, idx).some(m => m.content?.includes('##CONTACT_CARD##'));

                                        return (
                                            <div key={idx} className="wm-group">
                                                <div className="wm agent-msg">
                                                    <div className="wm-avatar agent-avatar">
                                                        <Headphones size={12} />
                                                    </div>
                                                    <div className="wm-bubble agent-bubble">
                                                        <span className="agent-msg-name">{msg.agent_name || 'Agent'}</span>
                                                        <p>{cleanContent}</p>
                                                    </div>
                                                </div>
                                                {isFirstContactMsg && <ContactCard />}
                                            </div>
                                        );
                                    }

                                    if (msg.role === 'assistant') {
                                        const { text: cleanContent, showContact, showMoreInfo, showContactSales, showBooking } = parseMessage(msg.content);
                                        // Only display the contact card for this message if it's the first one that triggered it
                                        // We detect "first" by checking if this message has the token AND no earlier message did
                                        const isFirstContactMsg = showContact &&
                                            !messages.slice(0, idx).some(m => m.content?.includes('##CONTACT_CARD##'));

                                        const isFirstBookingMsg = showBooking &&
                                            !messages.slice(0, idx).some(m => m.content?.includes('##BOOKING_FORM##'));

                                        const bubbles = splitIntoBubbles(cleanContent);
                                        return (
                                            <div key={idx} className="wm-group">
                                                {bubbles.map((chunk, bIdx) => (
                                                    <div key={bIdx} className="wm assistant">
                                                        <div className="wm-avatar" style={{ display: 'none' }}><Bot size={14} /></div>
                                                        <div className="wm-bubble">
                                                            <ReactMarkdown
                                                                components={{
                                                                    p: ({ children }) => <p><KeywordText text={extractText(children)} /></p>,
                                                                    li: ({ children }) => <li><KeywordText text={extractText(children)} /></li>,
                                                                    strong: ({ children }) => <strong><KeywordText text={extractText(children)} /></strong>,
                                                                }}
                                                            >{chunk}</ReactMarkdown>
                                                        </div>
                                                    </div>
                                                ))}

                                                {/* Booking Form */}
                                                {isFirstBookingMsg && (
                                                    <BookingForm
                                                        sessionId={sessionId}
                                                        userInfo={userInfo}
                                                        onBookingComplete={(data) => {
                                                            console.log("Booking completed:", data);
                                                        }}
                                                    />
                                                )}

                                                {/* Talk to Agent button — FIRST PRIORITY */}
                                                {(showMoreInfo || showContactSales) && !agentActive && agentRequestStatus !== 'pending' && (
                                                    <button
                                                        className="more-info-btn talk-to-agent-btn"
                                                        onClick={requestAgent}
                                                        disabled={agentRequestPending || isLoading}
                                                        title="Talk to a live agent"
                                                    >
                                                        🎧 Talk to an Agent
                                                    </button>
                                                )}
                                                {/* More info button */}
                                                {showMoreInfo && !usedMoreInfoRef.current.has(idx) && (
                                                    <button
                                                        className="more-info-btn"
                                                        onClick={() => {
                                                            usedMoreInfoRef.current.add(idx);
                                                            sendMessageRef.current?.('more info');
                                                        }}
                                                        disabled={!lastUserQueryRef.current || isLoading}
                                                        title="Get more details"
                                                    >
                                                        More info
                                                    </button>
                                                )}
                                                {/* Contact Card — SECOND PRIORITY (only if no agents available) */}
                                                {isFirstContactMsg && <ContactCard />}
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={idx} className="wm user">
                                            <div className="wm-bubble">
                                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            </div>
                                            <div className="wm-avatar user"><User size={14} /></div>
                                        </div>
                                    );
                                })}

                                {/* Typing Indicator */}
                                {isTyping && (
                                    <div className="wm assistant">
                                        <div className="wm-avatar agent-avatar-sm">
                                            <Headphones size={10} />
                                        </div>
                                        <div className="wm-bubble loading-bubble typing-indicator">
                                            <span /><span /><span />
                                            <span className="typing-label">Agent typing...</span>
                                        </div>
                                    </div>
                                )}

                                {isLoading && (
                                    <div className="wm assistant">
                                        <div className="wm-avatar" style={{ display: 'none' }}><Bot size={14} /></div>
                                        <div className="wm-bubble loading-bubble">
                                            <span /><span /><span />
                                        </div>
                                    </div>
                                )}

                                {/* Quick Action Buttons */}
                                {showQuickActions && (
                                    <div className="quick-actions">
                                        {QUICK_ACTIONS.map((a, i) => (
                                            <button key={i} className="qa-btn" onClick={() => handleQuickAction(a.query)}>
                                                {a.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Overflow: All agents busy */}
                                {overflowMode && (
                                    <div className="overflow-panel">
                                        <div className="overflow-icon">⏳</div>
                                        <p className="overflow-text">All agents are busy at the moment</p>
                                        <a
                                            href="https://wa.me/919704970484"
                                            target="_blank"
                                            rel="noreferrer"
                                            className="overflow-whatsapp-btn"
                                        >
                                            <img src="/whatsapp.png" alt="WhatsApp" className="wc-icon" />
                                            Continue on WhatsApp
                                        </a>
                                        <button className="overflow-dismiss" onClick={() => setOverflowMode(false)}>
                                            Dismiss
                                        </button>
                                    </div>
                                )}

                                <div ref={messagesEndRef} />
                            </div>

                            {/* Input */}
                            <div className="widget-input-area">
                                <form onSubmit={handleSend}>
                                    <input
                                        type="text"
                                        value={input}
                                        onChange={e => setInput(e.target.value)}
                                        placeholder={isListening ? 'Listening...' : 'Type a message...'}
                                        className="widget-input"
                                        autoFocus
                                    />
                                    <button
                                        type="button"
                                        className={`widget-mic-btn${isListening ? ' listening' : ''}`}
                                        onClick={toggleListening}
                                        disabled={isLoading}
                                        title={isListening ? 'Stop recording' : 'Voice input'}
                                    >
                                        <Mic size={16} />
                                    </button>
                                    <button type="submit" className="widget-send-btn" disabled={isLoading || !input.trim()}>
                                        Send
                                    </button>
                                </form>
                                <p className="widget-powered">Powered by Smartchat · Walkout Tech</p>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Toggle Bubble */}
            {!open && (
                <button className={`widget-bubble`} onClick={() => setOpen(true)} title="Chat with us">
                    <img src="/smartchat-icon.png" alt="Smart Chat" className="widget-bubble-img" />
                    <span className="bubble-ping" />
                </button>
            )}
        </>
    );
};

export default ChatInterface;
