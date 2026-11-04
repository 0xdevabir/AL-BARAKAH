'use client';

import { useSyncExternalStore } from 'react';
import { cart } from './cart';

const NONE: ReturnType<typeof cart.getLines> = [];

export function useCart() {
  const lines = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => cart.getLines(),
    () => NONE,
  );
  const count = lines.reduce((n, l) => n + l.qty, 0);
  const subtotal = lines.reduce((n, l) => n + l.qty * l.pricePoisha, 0);
  return { cart, lines, count, subtotal };
}
