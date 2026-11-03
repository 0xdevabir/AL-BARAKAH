import type { Medicine } from '#lib/app.svelte.ts';

const API = import.meta.env.VITE_API_BASE as string;

const EMPTY_PAGE = { items: [] as Medicine[], hasMore: false };
const CLOSED = { available: false, feePoisha: 0, minutes: 60 };

export async function load({ fetch }) {
  // Home must still paint if the API is unreachable (common on first app open).
  const get = async <T>(path: string): Promise<T | null> => {
    try {
      const res = await fetch(`${API}${path}`);
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  };

  const [firstPage, settings, slots] = await Promise.all([
    get<{ items: Medicine[]; hasMore: boolean }>('/medicines'),
    get<{ doctorBookingFeePoisha: number }>('/settings/public'),
    get<{ emergency: { available: boolean; feePoisha: number; minutes: number } }>('/delivery-slots'),
  ]);

  return {
    firstPage: firstPage ?? EMPTY_PAGE,
    doctorFee: settings?.doctorBookingFeePoisha ?? 0,
    emergency: slots?.emergency ?? CLOSED,
  };
}
