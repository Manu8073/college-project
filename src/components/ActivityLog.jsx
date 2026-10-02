import React, { useRef, useEffect } from 'react';
import { Terminal, Trash2, Copy, Check } from 'lucide-react';

export function ActivityLog({ logs = [], onClearLogs }) {
  const consoleRef = useRef(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-panel" role="region" aria-label="Activity and diagnostic log">
      <div className="panel-header">
        <div className="panel-title">
          <Terminal size={18} color="var(--accent-cyan)" />
          <span>Activity & Speech Log</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={handleCopy}
            className="action-btn btn-secondary"
            style={{ padding: '0.3rem 0.6rem', minHeight: 'auto', fontSize: '0.75rem' }}
            title="Copy logs"
          >
            {copied ? <Check size={13} color="#34d399" /> : <Copy size={13} />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={onClearLogs}
            className="action-btn btn-secondary"
            style={{ padding: '0.3rem 0.6rem', minHeight: 'auto', fontSize: '0.75rem' }}
            title="Clear logs"
          >
            <Trash2 size={13} />
            <span>Clear</span>
          </button>
        </div>
      </div>

      <div ref={consoleRef} className="log-console" tabIndex={0} aria-label="Console log text">
        {logs.length === 0 ? (
          <span style={{ color: 'var(--text-subtle)' }}>No events logged yet.</span>
        ) : (
          logs.map((line, idx) => {
            let className = '';
            if (line.includes('error') || line.includes('fail')) className = 'log-entry-error';
            else if (line.includes('SAY:')) className = 'log-entry-highlight';
            else if (line.includes('warning') || line.includes('mic permission')) className = 'log-entry-warn';

            return (
              <div key={idx} className={className}>
                {line}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
