import { error } from '@sveltejs/kit';
import type { Medicine } from '#lib/app.svelte.ts';

export async function load({ fetch, params }) {
  const res = await fetch(`${import.meta.env.VITE_API_BASE}/medicines/${encodeURIComponent(params.slug)}`);
  if (res.status === 404) error(404, 'Not found');
  if (!res.ok) error(502, 'Unavailable');
  return { medicine: (await res.json()) as Medicine };
}
