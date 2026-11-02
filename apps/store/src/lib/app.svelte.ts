import { browser } from '$app/env';
import { ApiClient, type TokenVault } from '@albarakah/ui';

export const MOBILE = import.meta.env.VITE_MOBILE as boolean;
const API_BASE = import.meta.env.VITE_API_BASE as string;

// Loaded only inside the app, so website visitors never download native code.
const vault: TokenVault | undefined = MOBILE
  ? {
      async get() {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        return (await SecureStorage.get('refresh')) as string | null;
      },
      async set(token) {
        const { SecureStorage } = await import('@aparajita/capacitor-secure-storage');
        if (token) await SecureStorage.set('refresh', token);
        else await SecureStorage.remove('refresh');
      },
    }
  : undefined;

export const api = new ApiClient(API_BASE, vault);

export async function tap() {
  if (!MOBILE) return;
  const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
  await Haptics.impact({ style: ImpactStyle.Light }).catch(() => undefined);
}

/** bKash opens in the system browser inside the app, then returns through the albarakah:// link. */
export async function openPayment(url: string) {
  if (!MOBILE) {
    location.href = url;
    return;
  }
  const { Browser } = await import('@capacitor/browser');
  await Browser.open({ url });
}

export interface CartLine { id: string; slug: string; name: string; form: string; strength: string; pricePoisha: number; isRx: boolean; qty: number }

const KEY = 'ab_cart';
function loadCart(): CartLine[] {
  if (!browser) return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

class Cart {
  lines = $state<CartLine[]>(loadCart());
  count = $derived(this.lines.reduce((n, l) => n + l.qty, 0));
  subtotal = $derived(this.lines.reduce((n, l) => n + l.qty * l.pricePoisha, 0));

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.lines)); } catch { /* private mode: cart lasts this visit */ }
  }
  qtyOf(id: string) {
    return this.lines.find((l) => l.id === id)?.qty ?? 0;
  }
  add(m: Omit<CartLine, 'qty'>) {
    const line = this.lines.find((l) => l.id === m.id);
    if (line) line.qty = Math.min(line.qty + 1, 50);
    else this.lines.push({ ...m, qty: 1 });
    this.save();
    void tap();
  }
  setQty(id: string, qty: number) {
    if (qty <= 0) this.lines = this.lines.filter((l) => l.id !== id);
    else {
      const line = this.lines.find((l) => l.id === id);
      if (line) line.qty = Math.min(qty, 50);
    }
    this.save();
    void tap();
  }
  clear() {
    this.lines = [];
    this.save();
  }
}
export const cart = new Cart();

export interface Medicine { id: string; slug: string; name: string; genericName: string; manufacturer: string; form: string; strength: string; packSize: string; pricePoisha: number; isRx: boolean; description: string; imageUrl: string; inStock: boolean }
