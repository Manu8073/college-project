/**
 * NETRA — Event Log Component
 * ─────────────────────────────────────────────────────────────
 * Part of the Shell module.
 * Displays the last N events in chronological order (newest first).
 * Demonstrates that the shared data contract is working.
 */

import { formatTimestamp, truncate } from '../../shared/utils/index.js';

const PRIORITY_COLORS = {
  low:      'priority--low',
  medium:   'priority--medium',
  high:     'priority--high',
  critical: 'priority--critical',
};

/**
 * @param {object}        props
 * @param {import('../../shared/types/events.js').NetraEvent[]} props.events
 * @param {Function}      props.onClear
 */
export default function EventLog({ events, onClear }) {
  return (
    <section className="module-card event-log-card" aria-labelledby="log-heading">
      <div className="module-header">
        <h2 id="log-heading" className="module-title">Activity Log</h2>
        <span className="badge badge--ready">{events.length} events</span>
      </div>

      <button
        id="btn-clear-log"
        className="btn btn--ghost"
        onClick={onClear}
        disabled={events.length === 0}
      >
        Clear Log
      </button>

      {events.length === 0 ? (
        <p className="empty-log" role="status">
          No events yet. Use the module buttons above to generate test events.
        </p>
      ) : (
        <ol className="event-list" aria-label="Event activity log" reversed>
          {[...events].reverse().map(event => (
            <li key={event.id} className="event-item">
              <div className="event-meta">
                <span className={`event-priority ${PRIORITY_COLORS[event.priority] ?? ''}`}>
                  {event.priority.toUpperCase()}
                </span>
                <span className="event-source">[{event.source}]</span>
                <span className="event-type">{event.type}</span>
                <time className="event-time" dateTime={event.timestamp}>
                  {formatTimestamp(event.timestamp)}
                </time>
              </div>
              <p className="event-payload">
                {truncate(JSON.stringify(event.payload), 120)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
