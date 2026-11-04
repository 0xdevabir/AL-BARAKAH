'use client';

export type SaleUnit = 'PACK' | 'PIECE';

export interface CartLine {
  id: string;
  slug: string;
  name: string;
  form: string;
  strength: string;
  /** Per pack, or per piece when unit is PIECE. */
  pricePoisha: number;
  isRx: boolean;
  /** Older saved carts have none: those lines are packs. */
  unit?: SaleUnit;
  qty: number;
}

export interface Medicine {
  id: string;
  slug: string;
  name: string;
  genericName: string;
  manufacturer: string;
  form: string;
  strength: string;
  packSize: string;
  pricePoisha: number;
  isRx: boolean;
  description: string;
  imageUrl: string;
  inStock: boolean;
  /** Tablets/capsules per pack when sold loose, else 0. */
  piecesPerPack: number;
  piecePricePoisha: number;
  looseInStock: boolean;
}

const KEY = 'ab_cart';
type Listener = () => void;

export const unitOf = (l: Pick<CartLine, 'unit'>): SaleUnit => l.unit ?? 'PACK';
/** Cart lines are one per medicine and unit: a pack and loose pieces of the same medicine sit side by side. */
export const lineKey = (l: Pick<CartLine, 'id' | 'unit'>) => `${l.id}|${unitOf(l)}`;
const same = (l: CartLine, id: string, unit: SaleUnit) => l.id === id && unitOf(l) === unit;

function loadCart(): CartLine[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[];
  } catch {
    return [];
  }
}

class CartStore {
  private lines: CartLine[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;

  private ensure() {
    if (!this.hydrated && typeof window !== 'undefined') {
      this.lines = loadCart();
      this.hydrated = true;
    }
  }

  subscribe(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit() {
    for (const l of this.listeners) l();
  }

  private save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.lines));
    } catch {
      /* private mode */
    }
    this.emit();
  }

  getLines() {
    this.ensure();
    return this.lines;
  }

  get count() {
    return this.getLines().reduce((n, l) => n + (unitOf(l) === 'PIECE' ? 1 : l.qty), 0);
  }

  get subtotal() {
    return this.getLines().reduce((n, l) => n + l.qty * l.pricePoisha, 0);
  }

  qtyOf(id: string, unit: SaleUnit = 'PACK') {
    return this.getLines().find((l) => same(l, id, unit))?.qty ?? 0;
  }

  add(m: Omit<CartLine, 'qty'>, qty = 1) {
    this.ensure();
    const unit = unitOf(m);
    const line = this.lines.find((l) => same(l, m.id, unit));
    if (line) line.qty = Math.min(line.qty + qty, 50);
    else this.lines = [...this.lines, { ...m, unit, qty: Math.min(qty, 50) }];
    this.save();
  }

  setQty(id: string, qty: number, unit: SaleUnit = 'PACK') {
    this.ensure();
    if (qty <= 0) this.lines = this.lines.filter((l) => !same(l, id, unit));
    else {
      this.lines = this.lines.map((l) => (same(l, id, unit) ? { ...l, qty: Math.min(qty, 50) } : l));
    }
    this.save();
  }

  clear() {
    this.ensure();
    this.lines = [];
    this.save();
  }
}

export const cart = new CartStore();
