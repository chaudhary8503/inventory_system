import { useEffect, useState } from 'react';

/*
  Hash routes (no router library): "#/item/<id>?location=<id>" ->
  { path: ['item', '<id>'], query: URLSearchParams('location=<id>') }.
  The Portal opens alert links as <inventory address> + link_path.
*/
export interface Route {
  path: string[];
  query: URLSearchParams;
}

function parse(hash: string): Route {
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  return {
    path: pathPart.split('/').filter(Boolean).map(decodeURIComponent),
    query: new URLSearchParams(queryPart),
  };
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/** Builds "#/a/b?x=1"; empty query values are dropped. */
export function href(path: string, query?: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v) q.set(k, v);
  const qs = q.toString();
  return `#/${path.replace(/^\//, '')}${qs ? `?${qs}` : ''}`;
}

export function go(path: string, query?: Record<string, string | null | undefined>): void {
  window.location.hash = href(path, query);
}
