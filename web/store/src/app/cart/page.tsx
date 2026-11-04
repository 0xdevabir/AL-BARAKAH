'use client';

import { formatTk } from '@albarakah/domain';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { FormGlyph } from '@/components/FormGlyph';
import { Stepper } from '@/components/Stepper';
import { useCart } from '@/lib/useCart';

export default function CartPage() {
  const { cart, lines, subtotal } = useCart();
  const router = useRouter();
  const [going, setGoing] = useState(false);

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
          <div className="group">
            {lines.map((l) => (
              <div key={l.id}>
                <FormGlyph form={l.form} />
                <div className="grow">
                  <strong>{l.name}</strong>
                  {l.strength ? <span className="muted small" style={{ display: 'block' }}>{l.strength}</span> : null}
                  <span className="price">{formatTk(l.pricePoisha * l.qty)}</span>
                </div>
                <Stepper qty={l.qty} label={l.name} onChange={(q) => cart.setQty(l.id, q)} />
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
            <button type="button" className="btn primary" disabled={going} onClick={() => void checkout()}>
              Checkout
            </button>
          </div>
        </>
      )}
    </div>
  );
}
