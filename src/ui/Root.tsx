import { useEffect, useState } from 'react';
import { App } from './App.tsx';
import { routeFor } from './leaveGuard.ts';
import { StudyApp } from './study/StudyApp.tsx';
import { LandmarkExplorer } from './tools/LandmarkExplorer.tsx';
import { V1Tool } from './tools/V1Tool.tsx';
import { V2Tool } from './tools/V2Tool.tsx';

/**
 * Hash routes for the developer tools: `#explorer` (Landmark Explorer), `#v1`
 * (validation V1), `#v2` (validation V2a), and `#study` (study mode, PROJECT_SPEC 5.8).
 * Changing route unmounts the previous view, which releases its camera; a running
 * study session keeps `#study` (leaveGuard.ts).
 */
export function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      const route = routeFor(window.location.hash);
      if (route !== window.location.hash) window.history.replaceState(null, '', route);
      setHash(route);
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  if (hash === '#explorer') return <LandmarkExplorer />;
  if (hash === '#v1') return <V1Tool />;
  if (hash === '#v2') return <V2Tool />;
  if (hash === '#study') return <StudyApp />;
  return <App />;
}
