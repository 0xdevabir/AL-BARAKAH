'use client';

import { formatTk } from '@albarakah/domain';
import { haptic } from '@albarakah/ui';
import Link from 'next/link';
import { useState, useSyncExternalStore } from 'react';
import { cart, type Medicine } from '@/lib/cart';
import { FormGlyph } from './FormGlyph';
import { Stepper } from './Stepper';

export function ProductCard({ medicine }: { medicine: Medicine }) {
  const qty = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => cart.qtyOf(medicine.id),
    () => 0,
  );
  const [photoFailed, setPhotoFailed] = useState(false);
  const size = [medicine.packSize, medicine.strength].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  const form = medicine.form?.trim() || '';

  return (
    <article className="product">
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
        </span>
        <span className="text">
          <strong className="name">{medicine.name}</strong>
          {size ? <span className="muted meta">{size}</span> : null}
          {form ? <span className="muted small meta">{form}</span> : null}
          {medicine.isRx ? <span className="chip warn">Rx</span> : null}
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
            className="btn small primary"
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
            Add
          </button>
        )}
      </div>
    </article>
  );
}
