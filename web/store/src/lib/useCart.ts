'use client';

import { useSyncExternalStore } from 'react';
import { cart, unitOf } from './cart';

const NONE: ReturnType<typeof cart.getLines> = [];

export function useCart() {
  const lines = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => cart.getLines(),
    () => NONE,
  );
  const rx = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => cart.getRx(),
    () => null,
  );
  // Loose tablets are one item on the badge, not one per tablet.
  const count = lines.reduce((n, l) => n + (unitOf(l) === 'PIECE' ? 1 : l.qty), 0);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.pricePoisha, 0);
  return { cart, lines, count, subtotal, rx };
}
