import type { Handle, HandleFetch } from '@sveltejs/kit/hooks';
import { paraglideMiddleware } from '#lib/paraglide/server.js';

const INTERNAL = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export const handle: Handle = ({ event, resolve }) =>
  paraglideMiddleware(event.request, ({ locale }) => {
    return resolve(event, { transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale) });
  });

/** During server rendering, go straight to the API instead of back out through nginx. */
export const handleFetch: HandleFetch = ({ event, request, fetch }) => {
  const url = new URL(request.url);
  if (url.origin === event.url.origin && url.pathname.startsWith('/api/')) {
    return fetch(new Request(`${INTERNAL}${url.pathname.slice(4)}${url.search}`, request));
  }
  return fetch(request);
};
