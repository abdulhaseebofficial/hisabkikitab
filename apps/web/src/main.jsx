import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { prepareInitialRoute } from './app/App';
import './index.css';

// Vite preview and generic SPA hosts may use the public homepage as fallback.
// Its canonical/Article tags must not leak onto private or auth screens.
if (window.location.pathname !== '/' && !/^\/(?:learn|tools)(?:\/|$)/.test(window.location.pathname)) {
  document.head.querySelectorAll('[data-learn-seo]').forEach((node) => node.remove());
  document.title = 'Hisab Ki Kitab';
}

// Keep useful static content visible until its interactive route is ready.
prepareInitialRoute(window.location.pathname).then(() => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode><App /></React.StrictMode>
  );
}).catch(() => console.error('The interactive page could not load. Reload to try again.'));
