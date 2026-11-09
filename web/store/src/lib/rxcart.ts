'use client';

import { haptic, toast } from '@albarakah/ui';
import { api } from './api';
import { cart, type SaleUnit } from './cart';

export interface RxCartItem {
  prescribed: string;
  dose: string;
  frequency: string;
  days: number;
  medicine: {
    id: string; slug: string; name: string; genericName: string; form: string; strength: string; packSize: string;
    pricePoisha: number; isRx: boolean; imageUrl: string; piecesPerPack: number; piecePricePoisha: number;
  } | null;
  unit?: SaleUnit;
  qty?: number;
  pieces?: number;
  inStock?: boolean;
}

export const rxLinePrice = (i: RxCartItem) =>
  !i.medicine || !i.qty ? 0 : (i.unit === 'PIECE' ? i.medicine.piecePricePoisha : i.medicine.pricePoisha) * i.qty;

/**
 * Fills the cart with a consultation's prescribed medicines (the full course, at today's prices) and
 * links the cart to that prescription so checkout needs no upload. Returns how many lines were added.
 */
export function addRxToCart(
  items: RxCartItem[],
  link: { consultationId: string; code: string; doctor: string; validUntil: string | null },
) {
  let added = 0;
  for (const i of items) {
    const m = i.medicine;
    if (!m || !i.inStock || !i.qty || !i.unit) continue;
    const pricePoisha = i.unit === 'PIECE' ? m.piecePricePoisha : m.pricePoisha;
    const have = cart.qtyOf(m.id, i.unit);
    if (!have) cart.add({ id: m.id, slug: m.slug, name: m.name, form: m.form, strength: m.strength, pricePoisha, isRx: m.isRx, unit: i.unit }, i.qty);
    else cart.setQty(m.id, Math.max(have, i.qty), i.unit);
    added++;
  }
  const medicineIds = items.map((i) => i.medicine?.id).filter((x): x is string => !!x);
  // An expired prescription still fills the cart, but cannot vouch for Rx medicines at checkout.
  const valid = !!link.validUntil && new Date(link.validUntil).getTime() > Date.now();
  if (added && valid) cart.setRx({ ...link, medicineIds });
  return added;
}

export async function loadRxCart(consultationId: string) {
  try {
    return (await api.get<{ items: RxCartItem[] }>(`/consultations/${consultationId}/rx-cart`)).items;
  } catch (err) {
    toast((err as Error).message, 'bad');
    return null;
  }
}

export function announceRxAdded(added: number, total: number) {
  if (!added) {
    toast('None of the prescribed medicines are in stock right now', 'bad');
    return;
  }
  haptic('success');
  toast(added < total ? `Added ${added} of ${total} medicines · the rest are unavailable` : 'Prescription added to cart');
}
