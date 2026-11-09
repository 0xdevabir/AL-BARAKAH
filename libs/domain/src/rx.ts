/** How long an e-prescription can be used to buy its prescription-only medicines. */
export const RX_VALID_DAYS = 30;

/** Doses a day from a frequency code: "1+0+1" → 2, "½+0+½" → 1. "As needed" and free text count as 0. */
export function dosesPerDay(frequency: string | null | undefined): number {
  const parts = (frequency ?? '').trim().split('+');
  if (parts.length < 2) return 0;
  let n = 0;
  for (const raw of parts) {
    const p = raw.trim();
    const v = p === '½' ? 0.5 : p === '' ? Number.NaN : Number(p);
    if (!Number.isFinite(v) || v < 0) return 0;
    n += v;
  }
  return n;
}

/**
 * What to put in the cart for one prescribed line. Tablets sold loose get exactly the course
 * (2 a day × 7 days = 14 pieces) when that is not a whole number of packs; otherwise whole packs.
 * Unknown courses and non-tablet forms default to one pack.
 */
export function rxCartQty(frequency: string, days: number, perPack: number, max = 50): { unit: 'PACK' | 'PIECE'; qty: number; pieces: number } {
  const pieces = Math.ceil(dosesPerDay(frequency) * Math.max(0, days));
  if (!perPack || pieces <= 0) return { unit: 'PACK', qty: 1, pieces };
  if (pieces % perPack !== 0 && pieces <= max) return { unit: 'PIECE', qty: pieces, pieces };
  return { unit: 'PACK', qty: Math.min(max, Math.ceil(pieces / perPack)), pieces };
}

/** Whether a prescription written at `writtenAt` still covers a purchase at `now`. */
export const rxValid = (writtenAt: Date, now = new Date()) => now.getTime() - writtenAt.getTime() <= RX_VALID_DAYS * 86_400_000;
