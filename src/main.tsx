import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

// Monetag service worker. The file lives at public/sw.js so Vite serves it at
// the site root (/sw.js) in both dev and production builds.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Ad network failure must never affect the chart app.
    });
  });
}

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found in document.');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
