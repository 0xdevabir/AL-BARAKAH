'use client';

import { formatTk } from '@albarakah/domain';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { FormGlyph } from '@/components/FormGlyph';
import { Stepper } from '@/components/Stepper';
import { api } from '@/lib/api';
import { cart, type Medicine } from '@/lib/cart';

export default function MedicinePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [med, setMed] = useState<Medicine | null>(null);
  const [error, setError] = useState('');
  const [photoFailed, setPhotoFailed] = useState(false);
  const qty = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => (med ? cart.qtyOf(med.id) : 0),
    () => 0,
  );

  useEffect(() => {
    void api
      .get<Medicine>(`/medicines/${slug}`)
      .then(setMed)
      .catch((err: Error) => setError(err.message));
  }, [slug]);

  if (error) {
    return (
      <div className="page empty">
        <p>{error}</p>
        <button className="btn" type="button" onClick={() => router.back()}>
          Back
        </button>
      </div>
    );
  }

  if (!med) return <div className="page muted">Loading…</div>;

  return (
    <div className="page stack">
      <button className="btn ghost small" type="button" onClick={() => router.back()} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>
        ‹ Back
      </button>
      <div className="row" style={{ alignItems: 'center' }}>
        {med.imageUrl && !photoFailed ? (
          <img
            className="med-photo"
            src={med.imageUrl}
            alt=""
            width={120}
            height={120}
            referrerPolicy="no-referrer"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <FormGlyph form={med.form} />
        )}
        <div className="grow">
          <h1 style={{ fontSize: '1.75rem', lineHeight: 1.15 }}>{med.name}</h1>
          {med.strength ? <p style={{ marginTop: 4, fontSize: '1.15rem', fontWeight: 600 }}>{med.strength}</p> : null}
          {med.form ? <p className="muted">{med.form}</p> : null}
        </div>
      </div>
      <p className="mono price" style={{ fontSize: '1.7rem', fontWeight: 700 }}>
        {formatTk(med.pricePoisha)}
      </p>
      <div className="tags">
        {med.isRx ? <span className="chip warn">Prescription required</span> : null}
        {!med.inStock ? <span className="chip off">Out of stock</span> : null}
      </div>
      <div className="group">
        <div className="row between">
          <span className="muted">Generic</span>
          <span>{med.genericName}</span>
        </div>
        {med.manufacturer ? (
          <div className="row between">
            <span className="muted">Maker</span>
            <span>{med.manufacturer}</span>
          </div>
        ) : null}
        {med.packSize ? (
          <div className="row between">
            <span className="muted">Pack</span>
            <span>{med.packSize}</span>
          </div>
        ) : null}
      </div>
      {med.description ? <p>{med.description}</p> : null}
      <div className={`dock${!med.inStock ? ' gone' : ''}`}>
        {!med.inStock ? (
          <span className="muted" style={{ fontWeight: 600 }}>
            Out of stock
          </span>
        ) : qty ? (
          <>
            <Stepper qty={qty} label={med.name} onChange={(q) => cart.setQty(med.id, q)} />
            <Link className="btn primary grow" href="/cart">
              View cart
            </Link>
          </>
        ) : (
          <button
            className="btn primary block"
            type="button"
            onClick={() =>
              cart.add({
                id: med.id,
                slug: med.slug,
                name: med.name,
                form: med.form,
                strength: med.strength,
                pricePoisha: med.pricePoisha,
                isRx: med.isRx,
              })
            }
          >
            Add to cart
          </button>
        )}
      </div>
    </div>
  );
}
