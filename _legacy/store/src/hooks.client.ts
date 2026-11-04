import type { ClientInit } from '@sveltejs/kit';

/** Capacitor / static hosts sometimes land on /index.html; that is not a route. */
export const init: ClientInit = () => {
  const { pathname, search, hash } = location;
  if (!pathname.endsWith('/index.html')) return;
  const next = `${pathname.replace(/\/index\.html$/, '/') || '/'}${search}${hash}`;
  history.replaceState(history.state, '', next);
};
