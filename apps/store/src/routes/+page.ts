import type { Medicine } from '#lib/app.svelte.ts';

const API = import.meta.env.VITE_API_BASE as string;

export async function load({ fetch }) {
  const get = <T>(path: string) => fetch(`${API}${path}`).then((r) => r.json() as Promise<T>);
  const [firstPage, settings, slots] = await Promise.all([
    get<{ items: Medicine[]; hasMore: boolean }>('/medicines'),
    get<{ doctorBookingFeePoisha: number }>('/settings/public'),
    get<{ emergency: { available: boolean; feePoisha: number; minutes: number } }>('/delivery-slots'),
  ]);
  return { firstPage, doctorFee: settings.doctorBookingFeePoisha, emergency: slots.emergency };
}
