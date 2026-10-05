import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import './index.css';

// Vite preview and generic SPA hosts may use the public homepage as fallback.
// Its canonical/Article tags must not leak onto private or auth screens.
if (window.location.pathname !== '/' && !/^\/(?:learn|tools)(?:\/|$)/.test(window.location.pathname)) {
  document.head.querySelectorAll('[data-learn-seo]').forEach((node) => node.remove());
  document.title = 'Hisabki Kitab - Smart money manager for hostel students';
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
