/**
 * NETRA — System Status Component
 * ─────────────────────────────────────────────────────────────
 * Part of the Shell module.
 * Shows a high-level overview of each module's readiness.
 */

import { MODULE_STATUS } from '../../shared/constants/index.js';

const STATUS_CLASS = {
  [MODULE_STATUS.READY]:        'status--ready',
  [MODULE_STATUS.PLACEHOLDER]:  'status--placeholder',
  [MODULE_STATUS.ACTIVE]:       'status--active',
  [MODULE_STATUS.ERROR]:        'status--error',
  [MODULE_STATUS.INITIALIZING]: 'status--initializing',
};

const MODULES = [
  { id: 'backend',    label: 'Backend API', owner: 'Shell (Member 4)',  status: MODULE_STATUS.READY       },
  { id: 'camera',     label: 'Camera',      owner: 'Shell (Member 4)',  status: MODULE_STATUS.READY       },
  { id: 'detection',  label: 'Detection',   owner: 'Member 1',          status: MODULE_STATUS.PLACEHOLDER },
  { id: 'navigation', label: 'Navigation',  owner: 'Member 2',          status: MODULE_STATUS.PLACEHOLDER },
  { id: 'ocr',        label: 'OCR',         owner: 'Member 3',          status: MODULE_STATUS.PLACEHOLDER },
  { id: 'speech',     label: 'Audio',       owner: 'Shell (Member 4)',  status: MODULE_STATUS.READY       },
];

export default function SystemStatus() {
  return (
    <section className="status-section" aria-labelledby="status-heading">
      <h2 id="status-heading" className="section-title">System Status</h2>
      <ul className="status-grid" role="list">
        {MODULES.map(mod => (
          <li key={mod.id} className="status-item">
            <span
              className={`status-dot ${STATUS_CLASS[mod.status] ?? ''}`}
              aria-hidden="true"
            />
            <div className="status-info">
              <span className="status-module-name">{mod.label}</span>
              <span className="status-owner">{mod.owner}</span>
            </div>
            <span className={`status-badge ${STATUS_CLASS[mod.status] ?? ''}`}>
              {mod.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
