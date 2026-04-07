import React, { useState } from 'react';
import axios from 'axios';
import './BookingForm.css';

const API_URL = import.meta.env.VITE_API_URL ?? '';

const BookingForm = ({ sessionId, onBookingComplete }) => {
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!date || !time) {
            setError('Please select both date and time');
            return;
        }

        setLoading(true);
        try {
            await axios.post(`${API_URL}/api/bookings`, {
                session_id: sessionId,
                date: date,
                time: time,
            });
            setSuccess(true);
            if (onBookingComplete) {
                onBookingComplete({ date, time });
            }
        } catch (err) {
            console.error('[Booking] Error:', err);
            setError('Failed to schedule booking. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="booking-form-container success">
                <div className="booking-success-icon">✓</div>
                <p>Demo booking confirmed for <strong>{date}</strong> at <strong>{time}</strong>.</p>
                <p>Our team will reach out to you shortly.</p>
            </div>
        );
    }

    return (
        <div className="booking-form-container">
            <form onSubmit={handleSubmit} className="booking-form">
                {error && <div className="booking-error">{error}</div>}

                <div className="booking-inputs">
                    <div className="booking-input-wrapper">
                        <input
                            type="date"
                            className="booking-input"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                        />
                    </div>
                    <div className="booking-input-wrapper">
                        <input
                            type="time"
                            className="booking-input"
                            value={time}
                            onChange={(e) => setTime(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className="booking-submit-btn"
                    disabled={loading || !date || !time}
                >
                    {loading ? 'Scheduling...' : 'Confirm Demo Booking'}
                </button>
            </form>
        </div>
    );
};

export default BookingForm;
