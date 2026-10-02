import React, { useState } from 'react';
import { Search, X, MapPin } from 'lucide-react';

export function ManualDestinationModal({ isOpen, onClose, onSubmitDestination }) {
  const [query, setQuery] = useState('');

  if (!isOpen) return null;

  const samples = [
    'MG Road Metro Station',
    'Brigade Road',
    'Cubbon Park Entrance',
    'General Hospital',
    'Central Bus Station',
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    onSubmitDestination(query.trim());
    setQuery('');
    onClose();
  };

  const handleSelectSample = (sample) => {
    onSubmitDestination(sample);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#fff' }}>
            Set Destination Manually
          </h3>
          <button
            onClick={onClose}
            className="action-btn btn-secondary"
            style={{ padding: '0.3rem', minHeight: 'auto', borderRadius: '50%' }}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
          Useful if microphone access is blocked or for testing specific routes.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ position: 'relative' }}>
            <input
              type="text"
              autoFocus
              className="input-field"
              placeholder="e.g. Central Library, Railway Station..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Destination query input"
            />
          </div>

          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', fontWeight: 600, textTransform: 'uppercase' }}>
              Quick Suggestions
            </span>
            <div className="sample-dest-tags" style={{ marginTop: '0.5rem' }}>
              {samples.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="sample-tag"
                  onClick={() => handleSelectSample(s)}
                >
                  <MapPin size={12} style={{ display: 'inline', marginRight: '4px' }} />
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              className="action-btn btn-secondary"
              style={{ minHeight: 'auto', padding: '0.6rem 1.2rem', fontSize: '0.9rem' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!query.trim()}
              className="action-btn btn-primary-go"
              style={{
                minHeight: 'auto',
                padding: '0.6rem 1.4rem',
                fontSize: '0.9rem',
                opacity: query.trim() ? 1 : 0.5,
              }}
            >
              Search & Navigate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
