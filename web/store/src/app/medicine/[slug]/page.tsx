'use client';

import { formatTk } from '@albarakah/domain';
import { haptic, Skeleton } from '@albarakah/ui';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useSyncExternalStore } from 'react';
import { FormGlyph } from '@/components/FormGlyph';
import { ProductCard } from '@/components/ProductCard';
import { Stepper } from '@/components/Stepper';
import { useGet } from '@/lib/api';
import { cart, type Medicine } from '@/lib/cart';

export default function MedicinePage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const { data: med, error } = useGet<Medicine>(`/medicines/${slug}`, { staleMs: 60_000 });
  const { data: alts } = useGet<Medicine[]>(`/medicines/${slug}/alternatives`, { staleMs: 120_000 });
  const [photoFailed, setPhotoFailed] = useState(false);
  const qty = useSyncExternalStore(
    (cb) => cart.subscribe(cb),
    () => (med ? cart.qtyOf(med.id) : 0),
    () => 0,
  );

  if (error) {
    return (
      <div className="page empty">
        <p>{error.message}</p>
        <button className="btn" type="button" onClick={() => router.back()}>Back</button>
      </div>
    );
  }

  if (!med) {
    return (
      <div className="page stack" aria-busy="true">
        <div className="row"><Skeleton h={120} w={120} r={20} /><span className="grow stack"><Skeleton h={28} w="80%" /><Skeleton h={18} w="40%" /></span></div>
        <Skeleton h={34} w={120} />
        <Skeleton h={140} r={18} />
      </div>
    );
  }

  const cheaper = alts?.filter((a) => a.inStock && a.pricePoisha < med.pricePoisha) ?? [];
  const saving = cheaper.length ? med.pricePoisha - Math.min(...cheaper.map((a) => a.pricePoisha)) : 0;

  return (
    <div className="page stack screen">
      <button className="btn ghost small" type="button" onClick={() => router.back()} style={{ alignSelf: 'flex-start', paddingLeft: 0 }}>‹ Back</button>
      <div className="row" style={{ alignItems: 'center' }}>
        {med.imageUrl && !photoFailed ? (
          <img className="med-photo" src={med.imageUrl} alt="" width={120} height={120} referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
        ) : (
          <FormGlyph form={med.form} />
        )}
        <div className="grow">
          <h1 style={{ fontSize: '1.75rem', lineHeight: 1.15 }}>{med.name}</h1>
          {med.strength ? <p style={{ marginTop: 4, fontSize: '1.15rem', fontWeight: 600 }}>{med.strength}</p> : null}
          {med.form ? <p className="muted">{med.form}</p> : null}
        </div>
      </div>
      <p className="mono price" style={{ fontSize: '1.7rem', fontWeight: 700 }}>{formatTk(med.pricePoisha)}</p>
      <div className="tags">
        {med.isRx ? <span className="chip warn">Prescription required</span> : null}
        {!med.inStock ? <span className="chip off">Out of stock</span> : null}
      </div>
      <div className="group">
        <Link className="row between" href={`/search?q=${encodeURIComponent(med.genericName)}`}>
          <span className="muted">Generic</span>
          <span>{med.genericName} ›</span>
        </Link>
        {med.manufacturer ? <div className="row between"><span className="muted">Maker</span><span>{med.manufacturer}</span></div> : null}
        {med.packSize ? <div className="row between"><span className="muted">Pack</span><span>{med.packSize}</span></div> : null}
      </div>
      {med.description ? <p>{med.description}</p> : null}

      {alts?.length ? (
        <section className="stack" style={{ gap: 10 }}>
          <div>
            <h2 style={{ fontSize: '1.15rem' }}>Same medicine, other makers</h2>
            <p className="muted small">
              {med.genericName} {med.strength}
              {saving > 0 ? ` · save up to ${formatTk(saving)}` : ''}
              {!med.inStock ? ' · these are in stock' : ''}
            </p>
          </div>
          <div className="hscroll alt-rail">
            {alts.map((a) => (
              <div key={a.id} className="alt-cell">
                <ProductCard medicine={a} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className={`dock${!med.inStock ? ' gone' : ''}`}>
        {!med.inStock ? (
          <span className="muted" style={{ fontWeight: 600 }}>Out of stock</span>
        ) : qty ? (
          <>
            <Stepper qty={qty} label={med.name} onChange={(q) => cart.setQty(med.id, q)} />
            <Link className="btn primary grow" href="/cart">View cart</Link>
          </>
        ) : (
          <button
            className="btn primary block"
            type="button"
            onClick={() => {
              haptic('light');
              cart.add({ id: med.id, slug: med.slug, name: med.name, form: med.form, strength: med.strength, pricePoisha: med.pricePoisha, isRx: med.isRx });
            }}
          >
            Add to cart · {formatTk(med.pricePoisha)}
          </button>
        )}
      </div>
    </div>
  );
}
