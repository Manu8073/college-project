import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import NetraPage from './pages/NetraPage.jsx';

// The previous multi-panel App is preserved at ./App.jsx
// Swap the import above to restore it.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <NetraPage />
  </StrictMode>
);
