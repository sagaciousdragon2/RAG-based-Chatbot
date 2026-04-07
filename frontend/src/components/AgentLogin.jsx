import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './AgentLogin.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

const AgentLogin = ({ onLogin }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!email.trim() || !password.trim()) {
            setError('Please fill in all fields');
            return;
        }
        setLoading(true);
        try {
            const res = await axios.post(`${API_URL}/api/agent/login`, { email, password });
            onLogin({ name: res.data.name, email: res.data.email });
            navigate('/dashboard');
        } catch (err) {
            setError(err.response?.data?.detail || 'Login failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1 className="auth-title">Sales Team Login</h1>
                <p className="auth-subtitle">Sign in to access your chat dashboard</p>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    {error && <div className="auth-error">{error}</div>}

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="login-email">Email Address</label>
                        <input
                            id="login-email"
                            type="email"
                            className="auth-input"
                            placeholder="you@walkouttech.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                            autoFocus
                        />
                    </div>

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="login-password">Password</label>
                        <input
                            id="login-password"
                            type="password"
                            className="auth-input"
                            placeholder="••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                        />
                    </div>

                    <button type="submit" className="auth-submit" disabled={loading}>
                        {loading ? <span className="auth-spinner" /> : 'Login'}
                    </button>
                </form>

                <p className="auth-link">
                    Don't have an account? <a href="/dashboard/register">Create one</a>
                </p>

                <p className="auth-footer">© 2026 Walkouttech.com</p>
            </div>
        </div>
    );
};

export default AgentLogin;
