import type { Medicine } from '#lib/app.svelte.ts';

const API = import.meta.env.VITE_API_BASE as string;

export async function load({ fetch }) {
  const get = <T>(path: string) => fetch(`${API}${path}`).then((r) => r.json() as Promise<T>);
  const [categories, meds, settings, slots] = await Promise.all([
    get<{ id: string; name: string; slug: string }[]>('/categories'),
    get<{ items: Medicine[] }>('/medicines'),
    get<{ doctorBookingFeePoisha: number }>('/settings/public'),
    get<{ emergency: { available: boolean; feePoisha: number; minutes: number } }>('/delivery-slots'),
  ]);
  return { categories, popular: meds.items.slice(0, 8), doctorFee: settings.doctorBookingFeePoisha, emergency: slots.emergency };
}
