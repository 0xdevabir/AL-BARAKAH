'use client';

export interface CartLine {
  id: string;
  slug: string;
  name: string;
  form: string;
  strength: string;
  pricePoisha: number;
  isRx: boolean;
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
}

const KEY = 'ab_cart';
type Listener = () => void;

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
    return this.getLines().reduce((n, l) => n + l.qty, 0);
  }

  get subtotal() {
    return this.getLines().reduce((n, l) => n + l.qty * l.pricePoisha, 0);
  }

  qtyOf(id: string) {
    return this.getLines().find((l) => l.id === id)?.qty ?? 0;
  }

  add(m: Omit<CartLine, 'qty'>) {
    this.ensure();
    const line = this.lines.find((l) => l.id === m.id);
    if (line) line.qty = Math.min(line.qty + 1, 50);
    else this.lines = [...this.lines, { ...m, qty: 1 }];
    this.save();
  }

  setQty(id: string, qty: number) {
    this.ensure();
    if (qty <= 0) this.lines = this.lines.filter((l) => l.id !== id);
    else {
      this.lines = this.lines.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, 50) } : l));
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
