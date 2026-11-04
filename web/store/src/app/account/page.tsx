'use client';

import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';
import { useApi } from '@/lib/api';

export default function AccountPage() {
  const { api, user, ready } = useApi();

  if (!ready) {
    return (
      <div className="page stack">
        <BrandLockup />
        <p className="muted">Loading your account…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page stack" style={{ paddingTop: 48 }}>
        <BrandLockup size={30} />
        <h1 className="title">Your account</h1>
        <p className="muted">Sign in to track orders and consultations.</p>
        <Link className="btn primary block" href="/login">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="page stack" style={{ paddingTop: 28 }}>
      <BrandLockup size={28} />
      <div>
        <h1 className="title" style={{ marginBottom: 8 }}>
          {user.name}
        </h1>
        <p className="muted mono">{user.phone}</p>
      </div>
      <div className="group">
        <Link href="/orders" className="chev">
          <span className="grow">Orders</span>
        </Link>
        <Link href="/doctors" className="chev">
          <span className="grow">Consultations</span>
        </Link>
      </div>
      <button className="btn danger block" onClick={() => void api.logout()}>
        Sign out
      </button>
    </div>
  );
}
