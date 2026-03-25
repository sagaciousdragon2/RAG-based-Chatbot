import React, { useState } from 'react';
import { User, Mail, Phone, ArrowRight, MessageCircle, Sparkles } from 'lucide-react';
import './PreChatForm.css';

const PreChatForm = ({ onStartChat, isLoading }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
    });
    const [errors, setErrors] = useState({});
    const [focusedField, setFocusedField] = useState(null);

    const validateForm = () => {
        const newErrors = {};
        if (!formData.name.trim()) newErrors.name = 'Full name is required';
        if (!formData.email.trim()) {
            newErrors.email = 'Email is required';
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
            newErrors.email = 'Please enter a valid email';
        }
        if (!formData.phone.trim()) {
            newErrors.phone = 'Phone number is required';
        } else if (!/^[\d\s+\-()]{7,15}$/.test(formData.phone)) {
            newErrors.phone = 'Please enter a valid phone number';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (validateForm()) {
            onStartChat(formData);
        }
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        if (errors[field]) {
            setErrors(prev => ({ ...prev, [field]: undefined }));
        }
    };

    return (
        <div className="prechat-container">
            {/* Animated background orbs */}
            <div className="prechat-orb prechat-orb-1" />
            <div className="prechat-orb prechat-orb-2" />
            <div className="prechat-orb prechat-orb-3" />

            {/* Header area */}
            <div className="prechat-header">
                <div className="prechat-logo-ring">
                    <div className="prechat-logo-inner">
                        <MessageCircle size={22} />
                    </div>
                </div>
                <h2 className="prechat-title">
                    Welcome to <span className="prechat-brand">SmartChat</span>
                </h2>
                <p className="prechat-subtitle">
                    Share your details and our team will assist you right away
                </p>
            </div>

            {/* Form */}
            <form className="prechat-form" onSubmit={handleSubmit} noValidate>
                {/* Full Name */}
                <div className={`prechat-field ${focusedField === 'name' ? 'focused' : ''} ${errors.name ? 'error' : ''}`}>
                    <div className="prechat-field-icon">
                        <User size={16} />
                    </div>
                    <div className="prechat-field-content">
                        <label className="prechat-label" htmlFor="pcf-name">Full Name</label>
                        <input
                            id="pcf-name"
                            type="text"
                            className="prechat-input"
                            placeholder="Enter your full name"
                            value={formData.name}
                            onChange={(e) => handleChange('name', e.target.value)}
                            onFocus={() => setFocusedField('name')}
                            onBlur={() => setFocusedField(null)}
                            autoComplete="name"
                        />
                    </div>
                    {errors.name && <span className="prechat-error">{errors.name}</span>}
                </div>

                {/* Email */}
                <div className={`prechat-field ${focusedField === 'email' ? 'focused' : ''} ${errors.email ? 'error' : ''}`}>
                    <div className="prechat-field-icon">
                        <Mail size={16} />
                    </div>
                    <div className="prechat-field-content">
                        <label className="prechat-label" htmlFor="pcf-email">Email Address</label>
                        <input
                            id="pcf-email"
                            type="email"
                            className="prechat-input"
                            placeholder="you@example.com"
                            value={formData.email}
                            onChange={(e) => handleChange('email', e.target.value)}
                            onFocus={() => setFocusedField('email')}
                            onBlur={() => setFocusedField(null)}
                            autoComplete="email"
                        />
                    </div>
                    {errors.email && <span className="prechat-error">{errors.email}</span>}
                </div>

                {/* Phone */}
                <div className={`prechat-field ${focusedField === 'phone' ? 'focused' : ''} ${errors.phone ? 'error' : ''}`}>
                    <div className="prechat-field-icon">
                        <Phone size={16} />
                    </div>
                    <div className="prechat-field-content">
                        <label className="prechat-label" htmlFor="pcf-phone">Phone Number</label>
                        <input
                            id="pcf-phone"
                            type="tel"
                            className="prechat-input"
                            placeholder="+91 9876 543 210"
                            value={formData.phone}
                            onChange={(e) => handleChange('phone', e.target.value)}
                            onFocus={() => setFocusedField('phone')}
                            onBlur={() => setFocusedField(null)}
                            autoComplete="tel"
                        />
                    </div>
                    {errors.phone && <span className="prechat-error">{errors.phone}</span>}
                </div>

                {/* Submit button */}
                <button
                    type="submit"
                    className="prechat-submit"
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <span className="prechat-spinner" />
                    ) : (
                        <>
                            <Sparkles size={16} />
                            Start Chat
                            <ArrowRight size={16} />
                        </>
                    )}
                </button>
            </form>

            {/* Footer */}
            <p className="prechat-footer">
                🔒 Your information is secure and private
            </p>
        </div>
    );
};

export default PreChatForm;
