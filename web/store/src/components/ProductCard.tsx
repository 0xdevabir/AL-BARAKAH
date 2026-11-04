'use client';

import { formatTk, pieceNoun } from '@albarakah/domain';
import { haptic } from '@albarakah/ui';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { cart, type Medicine } from '@/lib/cart';
import { FormGlyph } from './FormGlyph';
import { Stepper } from './Stepper';
import { lineFor, UnitToggle, useUnit } from './UnitToggle';

/** "30' pack" → "30 per pack"; single packs say nothing. */
function packLabel(pack?: string) {
  const n = Number(/^(\d+)/.exec(pack?.trim() ?? '')?.[1]);
  return n > 1 ? `${n} per pack` : '';
}

export function ProductCard({ medicine }: { medicine: Medicine }) {
  const { unit, setUnit, canChoose } = useUnit(medicine);
  const qty = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => cart.qtyOf(medicine.id, unit),
    () => 0,
  );
  const [photoFailed, setPhotoFailed] = useState(false);
  const form = medicine.form?.trim() || '';
  const detail = [form, medicine.strength?.trim(), packLabel(medicine.packSize)].filter(Boolean).join(', ');
  const generic = medicine.genericName?.trim();
  const loose = unit === 'PIECE';
  const available = loose ? medicine.looseInStock : medicine.inStock;
  const label = loose ? `${medicine.name} ${pieceNoun(medicine.form, 2)}` : medicine.name;

  return (
    <article className="product" data-in-cart={qty > 0}>
      <Link href={`/medicine/${medicine.slug}`} className="body">
        <span className="shot">
          {medicine.imageUrl && !photoFailed ? (
            <img
              src={medicine.imageUrl}
              alt=""
              width={160}
              height={160}
              loading="lazy"
              decoding="async"
              referrerPolicy="no-referrer"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <FormGlyph form={medicine.form} />
          )}
          {medicine.isRx ? (
            <span className="product-rx" title="Prescription needed">
              Rx
            </span>
          ) : null}
        </span>
        <span className="text">
          <strong className="name">{medicine.name}</strong>
          {generic ? <span className="generic">{generic}</span> : null}
          {detail ? <span className="muted meta">{detail}</span> : null}
        </span>
      </Link>
      <div className="foot">
        {canChoose ? <UnitToggle medicine={medicine} unit={unit} onChange={setUnit} /> : null}
        <span className="price mono">
          {formatTk(loose ? medicine.piecePricePoisha : medicine.pricePoisha)}
          {canChoose ? <span className="per">/{loose ? pieceNoun(medicine.form) : 'pack'}</span> : null}
        </span>
        {!available ? (
          <span className="chip off">Out of stock</span>
        ) : qty ? (
          <Stepper qty={qty} label={label} onChange={(q) => cart.setQty(medicine.id, q, unit)} />
        ) : (
          <button
            type="button"
            className="btn small primary product-add"
            aria-label={`Add ${label}`}
            onClick={() => {
              haptic('light');
              cart.add(lineFor(medicine, unit));
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            Add
          </button>
        )}
      </div>
    </article>
  );
}
