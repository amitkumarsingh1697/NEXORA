import { useEffect, useState } from 'react';

export interface Route {
  path: string;
  query: URLSearchParams;
}

function current(): Route {
  return { path: location.pathname, query: new URLSearchParams(location.search) };
}

export function navigate(to: string, replace = false): void {
  if (replace) history.replaceState(null, '', to);
  else history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRoute(): Route {
  const [r, setR] = useState(current);
  useEffect(() => {
    const on = () => setR(current());
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  return r;
}

/** Update one query parameter, keeping the rest. */
export function setQuery(key: string, value: string | null): void {
  const q = new URLSearchParams(location.search);
  if (value === null) q.delete(key);
  else q.set(key, value);
  const s = q.toString();
  navigate(`${location.pathname}${s ? `?${s}` : ''}`);
}
