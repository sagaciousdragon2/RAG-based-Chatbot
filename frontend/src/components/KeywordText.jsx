import React, { useState, useEffect, useRef } from 'react';
import { KEYWORD_ARTICLES, SORTED_KEYWORDS } from './keywordArticles';
import './KeywordPopup.css';

/**
 * Parse plain text (non-markdown) and wrap matched keywords in <mark> elements.
 * Returns an array of strings and <mark> elements.
 */
function parseKeywords(text, onKeywordClick) {
    const result = [];
    let remaining = text;
    let key = 0;

    while (remaining.length > 0) {
        let earliestIndex = -1;
        let matchedKeyword = null;

        // Find first occurrence of any keyword
        for (const kw of SORTED_KEYWORDS) {
            const idx = remaining.toLowerCase().indexOf(kw.toLowerCase());
            if (idx !== -1 && (earliestIndex === -1 || idx < earliestIndex)) {
                earliestIndex = idx;
                matchedKeyword = kw;
            }
        }

        if (matchedKeyword === null) {
            result.push(<span key={key++}>{remaining}</span>);
            break;
        }

        // Text before keyword
        if (earliestIndex > 0) {
            result.push(<span key={key++}>{remaining.slice(0, earliestIndex)}</span>);
        }

        // The keyword itself
        const kwText = remaining.slice(earliestIndex, earliestIndex + matchedKeyword.length);
        result.push(
            <mark
                key={key++}
                className="keyword-highlight"
                onClick={() => onKeywordClick(matchedKeyword)}
                title={`Click to learn about ${matchedKeyword}`}
            >
                {kwText}
            </mark>
        );

        remaining = remaining.slice(earliestIndex + matchedKeyword.length);
    }

    return result;
}

export function KeywordText({ text }) {
    const [activeKeyword, setActiveKeyword] = useState(null);
    const [popupPos, setPopupPos] = useState({ top: 0, left: 0 });
    const popupRef = useRef(null);

    const handleKeywordClick = (kw) => {
        setActiveKeyword(kw);
    };

    const handleClose = () => setActiveKeyword(null);

    // Close on outside click
    useEffect(() => {
        const handler = (e) => {
            if (popupRef.current && !popupRef.current.contains(e.target) && !e.target.classList.contains('keyword-highlight')) {
                setActiveKeyword(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const article = activeKeyword ? KEYWORD_ARTICLES[activeKeyword] : null;

    return (
        <span style={{ position: 'relative' }}>
            {parseKeywords(text, handleKeywordClick)}
            {article && (
                <>
                    <div className="keyword-overlay" onClick={handleClose} />
                    <div className="keyword-popup" ref={popupRef}>
                        <div className="keyword-popup-header">
                            <h3>{article.title}</h3>
                            <button className="keyword-popup-close" onClick={handleClose}>✕</button>
                        </div>
                        <p className="keyword-popup-content">{article.content}</p>
                        <div className="keyword-popup-footer">
                            <a href="https://walkouttech.com" target="_blank" rel="noreferrer">
                                Learn more at walkouttech.com →
                            </a>
                        </div>
                    </div>
                </>
            )}
        </span>
    );
}
