import { useEffect, useState } from 'react';
import { App } from './App.tsx';
import { LandmarkExplorer } from './tools/LandmarkExplorer.tsx';
import { V1Tool } from './tools/V1Tool.tsx';

/**
 * Hash routes for the developer tools: `#explorer` (Landmark Explorer) and `#v1`
 * (validation V1). Changing route unmounts the previous view, which releases its
 * camera.
 */
export function Root() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
    };
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
    };
  }, []);

  if (hash === '#explorer') return <LandmarkExplorer />;
  if (hash === '#v1') return <V1Tool />;
  return <App />;
}
