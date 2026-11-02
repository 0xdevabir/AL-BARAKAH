// The app build has no server, so every screen renders on the device.
export const ssr = !import.meta.env.VITE_MOBILE;
export const prerender = false;

const API = import.meta.env.VITE_API_BASE as string;

export async function load({ fetch }) {
  // The navigation still works without categories, so a failure here must not take down every page.
  const all = await fetch(`${API}/categories`)
    .then((r) => (r.ok ? (r.json() as Promise<{ id: string; name: string; slug: string; count: number }[]>) : []))
    .catch(() => []);
  return { categories: all.filter((c) => c.count > 0) };
}
