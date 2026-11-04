/**
 * Tablets and capsules can be bought by the piece (a few cut from a strip) instead of a whole pack.
 * Pieces per pack comes from the pack size text ("30' pack", "10's pack", "14"); 0 means pack only.
 */
export function piecesPerPack(form: string | null | undefined, packSize: string | null | undefined): number {
  if (!/tablet|capsule/i.test(form ?? '')) return 0;
  const m = /^(\d+)\s*(?:['’]\s*s?|s)?\s*(?:pack|tablets?|capsules?)?\s*$/i.exec((packSize ?? '').trim());
  const n = Number(m?.[1]);
  return n > 1 && n <= 1000 ? n : 0;
}

/** One piece costs the pack price split evenly, rounded up so loose sales never undercut the pack. */
export function piecePricePoisha(packPricePoisha: number, perPack: number): number {
  return perPack > 1 ? Math.ceil(packPricePoisha / perPack) : packPricePoisha;
}

/** "tablet" / "capsule", for labels like "4 tablets". */
export function pieceNoun(form: string | null | undefined, count = 1): string {
  const noun = /capsule/i.test(form ?? '') ? 'capsule' : 'tablet';
  return count === 1 ? noun : `${noun}s`;
}
