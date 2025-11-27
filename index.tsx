import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  // StrictMode is intentional, but note that it causes double-invocation of useEffects in dev.
  // Our socket/peer logic handles this via cleanup functions.
  <React.StrictMode>
    <App />
  </React.StrictMode>
);