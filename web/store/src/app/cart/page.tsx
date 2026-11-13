'use client';

import { formatTk, pieceNoun } from '@albarakah/domain';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormGlyph } from '@/components/FormGlyph';
import { QuickOrder } from '@/components/QuickOrder';
import { Stepper } from '@/components/Stepper';
import { lineKey } from '@/lib/cart';
import { useCart } from '@/lib/useCart';

export default function CartPage() {
  const { cart, lines, subtotal, rx } = useCart();
  const router = useRouter();
  const [going, setGoing] = useState(false);
  const [quick, setQuick] = useState(false);

  async function checkout() {
    if (going || lines.length === 0) return;
    setGoing(true);
    try {
      router.push('/checkout');
    } finally {
      setGoing(false);
    }
  }

  return (
    <div className="page">
      <h1 className="title">Cart</h1>
      {lines.length === 0 ? (
        <div className="empty stack">
          <p>Your cart is empty.</p>
          <Link className="btn primary" href="/search">
            Browse medicines
          </Link>
        </div>
      ) : (
        <>
          {rx ? (
            <div className="notice row between" style={{ gap: 10, marginBottom: 12 }}>
              <span>℞ From {rx.doctor}&rsquo;s prescription · <span className="mono">{rx.code}</span></span>
              <button type="button" className="btn small ghost" onClick={() => cart.setRx(null)}>Unlink</button>
            </div>
          ) : null}
          <div className="group">
            {lines.map((l) => (
              <div key={lineKey(l)}>
                <FormGlyph form={l.form} />
                <div className="grow">
                  <strong>{l.name}</strong>
                  {l.strength || l.unit === 'PIECE' ? (
                    <span className="muted small" style={{ display: 'block' }}>
                      {[l.strength, l.unit === 'PIECE' ? `Loose ${pieceNoun(l.form, 2)} · ${formatTk(l.pricePoisha)} each` : ''].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                  <span className="price">{formatTk(l.pricePoisha * l.qty)}</span>
                </div>
                <Stepper qty={l.qty} label={l.name} onChange={(q) => cart.setQty(l.id, q, l.unit)} />
              </div>
            ))}
          </div>
          <div className="dock">
            <span className="grow">
              <span className="muted small">Subtotal</span>
              <strong className="mono" style={{ display: 'block', fontSize: '1.45rem' }}>
                {formatTk(subtotal)}
              </strong>
            </span>
            <button type="button" className="btn" onClick={() => setQuick(true)}>
              ⚡ Quick order
            </button>
            <button type="button" className="btn primary" disabled={going} onClick={() => void checkout()}>
              Checkout
            </button>
          </div>
          <QuickOrder open={quick} onClose={() => setQuick(false)} />
        </>
      )}
    </div>
  );
}
