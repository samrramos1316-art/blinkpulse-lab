import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Root } from './ui/Root.tsx';
import { applyThemePreference, readThemePreference } from './ui/theme/theme.ts';
import './ui/theme/tokens.css';
import './ui/theme/base.css';
import './ui/App.css';

// Apply a stored manual theme before first paint of the app (no inline script: CSP).
applyThemePreference(readThemePreference(), document.documentElement);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
