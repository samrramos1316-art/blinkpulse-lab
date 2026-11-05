import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startNetworkLog } from './app/networkLog.ts';
import { Root } from './ui/Root.tsx';
import { applyThemePreference, readThemePreference } from './ui/theme/theme.ts';
import './ui/theme/tokens.css';
import './ui/theme/base.css';
import './ui/App.css';

startNetworkLog();

// Apply a stored manual theme before first paint of the app (no inline script: CSP).
applyThemePreference(readThemePreference(), document.documentElement);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element');

createRoot(rootEl).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
