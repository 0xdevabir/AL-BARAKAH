'use client';

import { pieceNoun } from '@albarakah/domain';
import { useState } from 'react';
import type { CartLine, Medicine, SaleUnit } from '@/lib/cart';

/** The cart line for buying this medicine by the pack or as loose pieces. */
export function lineFor(m: Medicine, unit: SaleUnit): Omit<CartLine, 'qty'> {
  return {
    id: m.id, slug: m.slug, name: m.name, form: m.form, strength: m.strength, isRx: m.isRx, unit,
    pricePoisha: unit === 'PIECE' ? m.piecePricePoisha : m.pricePoisha,
  };
}

/** Starts on Pack, or on loose pieces when only those are left. */
export function useUnit(m: Medicine | undefined) {
  const [chosen, setUnit] = useState<SaleUnit | null>(null);
  const loose = !!m?.piecesPerPack && !!m.looseInStock;
  const unit: SaleUnit = chosen ?? (m && !m.inStock && loose ? 'PIECE' : 'PACK');
  return { unit: loose ? unit : 'PACK', setUnit, canChoose: loose };
}

/** Pack / Tablet switch for medicines that can be bought by the piece. */
export function UnitToggle({ medicine: m, unit, onChange }: { medicine: Medicine; unit: SaleUnit; onChange: (u: SaleUnit) => void }) {
  const noun = pieceNoun(m.form);
  const options: { value: SaleUnit; label: string; off: boolean }[] = [
    { value: 'PACK', label: `Pack of ${m.piecesPerPack}`, off: !m.inStock },
    { value: 'PIECE', label: noun[0]!.toUpperCase() + noun.slice(1), off: !m.looseInStock },
  ];
  return (
    <div className="unit-toggle" role="radiogroup" aria-label={`Buy ${m.name} by`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={unit === o.value}
          className={unit === o.value ? 'on' : ''}
          disabled={o.off}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
