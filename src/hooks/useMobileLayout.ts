import { useEffect, useState } from 'react';
import { isAndroidRuntime } from '../services/tauriMediaService';

const MOBILE_QUERY = '(max-width: 1000px)';

export function useMobileLayout() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(MOBILE_QUERY).matches);
  useEffect(() => {
    const query = window.matchMedia(MOBILE_QUERY);
    const sync = () => setNarrow(query.matches);
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return narrow || isAndroidRuntime();
}
