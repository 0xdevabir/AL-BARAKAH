import { type EPrescription, ePrescriptionSchema } from '@albarakah/contracts';
import type { PrismaClient } from '@albarakah/database';
import { piecePricePoisha, piecesPerPack, rxCartQty, rxValid } from '@albarakah/domain';

/** A consultation's prescription as stored; rows written before the schema grew fields still parse. */
export function readRx(raw: unknown): EPrescription | null {
  if (!raw) return null;
  const r = ePrescriptionSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/**
 * Matches each prescribed line to a catalogue medicine: the one the doctor picked, or — for lines typed
 * by hand — an active medicine with exactly that name. Returns one entry per line, in order.
 */
export async function resolveRx(prisma: PrismaClient, rx: EPrescription) {
  const ids = rx.items.map((i) => i.medicineId).filter((x): x is string => !!x);
  const names = rx.items.filter((i) => !i.medicineId).map((i) => i.medicine.trim()).filter(Boolean);
  const select = { id: true, slug: true, name: true, genericName: true, form: true, strength: true, packSize: true, pricePoisha: true, isRx: true, imageUrl: true } as const;
  const [byIdRows, byNameRows] = await Promise.all([
    ids.length ? prisma.medicine.findMany({ where: { id: { in: ids }, isActive: true }, select }) : [],
    names.length ? prisma.medicine.findMany({ where: { isActive: true, OR: names.map((n) => ({ name: { equals: n, mode: 'insensitive' as const } })) }, select, orderBy: { popularity: 'desc' } }) : [],
  ]);
  const byId = new Map(byIdRows.map((m) => [m.id, m]));
  const byName = new Map<string, (typeof byNameRows)[number]>();
  for (const m of byNameRows) if (!byName.has(m.name.toLowerCase())) byName.set(m.name.toLowerCase(), m);
  return rx.items.map((item) => ({
    item,
    medicine: (item.medicineId ? byId.get(item.medicineId) : byName.get(item.medicine.trim().toLowerCase())) ?? null,
  }));
}

/** The prescribed medicines as cart lines, with today's prices, stock and the course quantity. */
export async function rxCart(prisma: PrismaClient, rx: EPrescription) {
  const resolved = await resolveRx(prisma, rx);
  const ids = resolved.map((r) => r.medicine?.id).filter((x): x is string => !!x);
  const stock = ids.length
    ? await prisma.batch.groupBy({ by: ['medicineId'], where: { medicineId: { in: ids }, expiresAt: { gte: new Date(new Date().toISOString().slice(0, 10)) } }, _sum: { qtyRemaining: true, looseQty: true } })
    : [];
  const stockOf = new Map(stock.map((s) => [s.medicineId, { packs: s._sum.qtyRemaining ?? 0, loose: s._sum.looseQty ?? 0 }]));
  return resolved.map(({ item, medicine: m }) => {
    if (!m) return { prescribed: item.medicine, dose: item.dose, frequency: item.frequency, days: item.days, medicine: null };
    const perPack = piecesPerPack(m.form, m.packSize);
    const s = stockOf.get(m.id) ?? { packs: 0, loose: 0 };
    let { unit, qty, pieces } = rxCartQty(item.frequency, item.days, perPack);
    const looseOk = perPack > 0 && (s.packs > 0 || s.loose >= qty);
    // Out of whole packs but loose pieces left: buy the course loose when it fits.
    if (unit === 'PACK' && s.packs < qty && perPack && pieces > 0 && pieces <= 50 && s.loose >= pieces) ({ unit, qty } = { unit: 'PIECE', qty: pieces });
    const inStock = unit === 'PACK' ? s.packs >= qty : looseOk;
    return {
      prescribed: item.medicine, dose: item.dose, frequency: item.frequency, days: item.days,
      medicine: { ...m, piecesPerPack: perPack, piecePricePoisha: perPack ? piecePricePoisha(m.pricePoisha, perPack) : 0 },
      unit, qty, pieces, inStock,
    };
  });
}

/**
 * The prescription-only medicines a customer's consultation lets them buy now. Empty when the
 * consultation is not theirs, has no prescription, or the prescription has expired.
 */
export async function rxCoverage(prisma: PrismaClient, customerId: string, consultationId: string, now = new Date()) {
  const c = await prisma.consultation.findFirst({
    where: { id: consultationId, customerId, status: 'COMPLETED' },
    select: { id: true, prescription: true, prescribedAt: true, updatedAt: true },
  });
  const rx = readRx(c?.prescription);
  if (!c || !rx || !rxValid(c.prescribedAt ?? c.updatedAt, now)) return null;
  const resolved = await resolveRx(prisma, rx);
  return { consultationId: c.id, medicineIds: new Set(resolved.map((r) => r.medicine?.id).filter((x): x is string => !!x)) };
}
