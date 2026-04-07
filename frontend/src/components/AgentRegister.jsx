import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './AgentLogin.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const AgentRegister = () => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (!name.trim() || !email.trim() || !password.trim()) {
            setError('Please fill in all fields');
            return;
        }
        if (password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }
        setLoading(true);
        try {
            await axios.post(`${API_URL}/api/agent/signup`, { name, email, password });
            navigate('/dashboard/login');
        } catch (err) {
            setError(err.response?.data?.detail || 'Registration failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="auth-page">
            <div className="auth-card">
                <h1 className="auth-title">Create Agent Account</h1>
                <p className="auth-subtitle">Register to join the sales team dashboard</p>

                <form className="auth-form" onSubmit={handleSubmit} noValidate>
                    {error && <div className="auth-error">{error}</div>}

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-name">Full Name</label>
                        <input
                            id="reg-name"
                            type="text"
                            className="auth-input"
                            placeholder="Your full name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoComplete="name"
                            autoFocus
                        />
                    </div>

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-email">Email Address</label>
                        <input
                            id="reg-email"
                            type="email"
                            className="auth-input"
                            placeholder="you@walkouttech.com"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                        />
                    </div>

                    <div className="auth-field">
                        <label className="auth-label" htmlFor="reg-password">Password</label>
                        <input
                            id="reg-password"
                            type="password"
                            className="auth-input"
                            placeholder="At least 6 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="new-password"
                        />
                    </div>

                    <button type="submit" className="auth-submit" disabled={loading}>
                        {loading ? <span className="auth-spinner" /> : 'Create Account'}
                    </button>
                </form>

                <p className="auth-link">
                    Already have an account? <a href="/dashboard/login">Sign in</a>
                </p>

                <p className="auth-footer">© 2026 Walkouttech.com</p>
            </div>
        </div>
    );
};

export default AgentRegister;
