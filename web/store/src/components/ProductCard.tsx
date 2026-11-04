'use client';

import { formatTk } from '@albarakah/domain';
import { haptic } from '@albarakah/ui';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { cart, type Medicine } from '@/lib/cart';
import { FormGlyph } from './FormGlyph';
import { Stepper } from './Stepper';

/** "30' pack" → "30 per pack"; single packs say nothing. */
function packLabel(pack?: string) {
  const n = Number(/^(\d+)/.exec(pack?.trim() ?? '')?.[1]);
  return n > 1 ? `${n} per pack` : '';
}

export function ProductCard({ medicine }: { medicine: Medicine }) {
  const qty = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => cart.qtyOf(medicine.id),
    () => 0,
  );
  const [photoFailed, setPhotoFailed] = useState(false);
  const form = medicine.form?.trim() || '';
  const detail = [form, medicine.strength?.trim(), packLabel(medicine.packSize)].filter(Boolean).join(', ');
  const generic = medicine.genericName?.trim();

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
        <span className="price mono">{formatTk(medicine.pricePoisha)}</span>
        {!medicine.inStock ? (
          <span className="chip off">Out of stock</span>
        ) : qty ? (
          <Stepper qty={qty} label={medicine.name} onChange={(q) => cart.setQty(medicine.id, q)} />
        ) : (
          <button
            type="button"
            className="btn small primary product-add"
            aria-label={`Add ${medicine.name}`}
            onClick={() => {
              haptic('light');
              cart.add({
                id: medicine.id,
                slug: medicine.slug,
                name: medicine.name,
                form: medicine.form,
                strength: medicine.strength,
                pricePoisha: medicine.pricePoisha,
                isRx: medicine.isRx,
              });
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
