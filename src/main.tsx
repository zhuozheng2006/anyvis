import React from 'react';
import ReactDOM from 'react-dom/client';
const query = new URLSearchParams(window.location.search);
// Keep the already-open v0.1 development tab and its draft available.
const legacy = query.has('legacy') || (location.port === '5173' && !query.has('studio'));
const App = React.lazy(() => legacy ? import('./App') : import('./studio/StudioApp'));
if (legacy) void import('./styles.css');
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><React.Suspense fallback={<div style={{ padding: 32, fontFamily: 'sans-serif' }}>正在打开 AnyVis…</div>}><App /></React.Suspense></React.StrictMode>,
);
