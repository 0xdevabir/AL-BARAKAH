'use client';

import { piecePricePoisha, piecesPerPack } from '@albarakah/domain';
import { haptic, toast } from '@albarakah/ui';
import { api } from './api';
import { cart, type SaleUnit } from './cart';

interface Reorder {
  items: {
    medicine: { id: string; slug: string; name: string; strength: string; form: string; packSize: string; pricePoisha: number; isRx: boolean };
    qty: number;
    unit: SaleUnit;
  }[];
  unavailable: number;
}

/** Puts a past order back into the cart at today's prices. Returns true when anything was added. */
export async function reorder(orderId: string) {
  try {
    const r = await api.get<Reorder>(`/orders/${orderId}/reorder`);
    let added = 0;
    for (const { medicine: m, qty, unit } of r.items) {
      const perPack = piecesPerPack(m.form, m.packSize);
      // A medicine no longer sold loose (pack size changed) is skipped rather than turned into whole packs.
      if (unit === 'PIECE' && !perPack) continue;
      const pricePoisha = unit === 'PIECE' ? piecePricePoisha(m.pricePoisha, perPack) : m.pricePoisha;
      const have = cart.qtyOf(m.id, unit);
      if (!have) cart.add({ id: m.id, slug: m.slug, name: m.name, form: m.form, strength: m.strength, pricePoisha, isRx: m.isRx, unit });
      cart.setQty(m.id, Math.max(have, qty), unit);
      added++;
    }
    const missing = r.unavailable + r.items.length - added;
    if (!added) {
      toast('None of these medicines are available right now', 'bad');
      return false;
    }
    haptic('success');
    toast(missing ? `Added to cart · ${missing} no longer available` : 'Added to cart');
    return true;
  } catch (err) {
    toast((err as Error).message, 'bad');
    return false;
  }
}
