import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { captureToken } from './api';
import { App } from './App';
import './styles.css';

captureToken();
// Opening the session link in an already-open tab only changes the hash.
window.addEventListener('hashchange', () => {
  captureToken();
  window.dispatchEvent(new PopStateEvent('popstate'));
});
const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
