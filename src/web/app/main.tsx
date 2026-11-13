import React from 'react';
import ReactDOM from 'react-dom/client';
import '@xyflow/react/dist/style.css';

import App from './App.js';
import { FeedbackProvider } from './components/FeedbackProvider.js';

// Global API fetch interceptor to automatically attach Authorization Bearer token
const originalFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('roadmap_auth_token');
  const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;

  if (token && (url.startsWith('/api/') || url.includes('/api/'))) {
    const headers = new Headers(init?.headers);
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return originalFetch(input, { ...init, headers });
  }

  return originalFetch(input, init);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <FeedbackProvider>
      <App />
    </FeedbackProvider>
  </React.StrictMode>
);
