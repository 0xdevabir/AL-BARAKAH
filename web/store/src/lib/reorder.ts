'use client';

import { haptic, toast } from '@albarakah/ui';
import { api } from './api';
import { cart } from './cart';

interface Reorder {
  items: { medicine: { id: string; slug: string; name: string; strength: string; form: string; pricePoisha: number; isRx: boolean }; qty: number }[];
  unavailable: number;
}

/** Puts a past order back into the cart at today's prices. Returns true when anything was added. */
export async function reorder(orderId: string) {
  try {
    const r = await api.get<Reorder>(`/orders/${orderId}/reorder`);
    for (const { medicine: m, qty } of r.items) {
      const have = cart.qtyOf(m.id);
      if (!have) cart.add({ id: m.id, slug: m.slug, name: m.name, form: m.form, strength: m.strength, pricePoisha: m.pricePoisha, isRx: m.isRx });
      cart.setQty(m.id, Math.max(have, qty));
    }
    if (!r.items.length) {
      toast('None of these medicines are available right now', 'bad');
      return false;
    }
    haptic('success');
    toast(r.unavailable ? `Added to cart · ${r.unavailable} no longer available` : 'Added to cart');
    return true;
  } catch (err) {
    toast((err as Error).message, 'bad');
    return false;
  }
}
