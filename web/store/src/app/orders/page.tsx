import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';

export default function OrdersPage() {
  return (
    <div className="page stack" style={{ paddingTop: 28 }}>
      <BrandLockup size={26} />
      <h1 className="title">Orders</h1>
      <p className="muted">Track deliveries and revisit past purchases.</p>
      <div className="empty">
        <p>Order history lands here next. Your account already syncs through the API gateway.</p>
        <Link className="btn primary" href="/account">
          Open account
        </Link>
      </div>
    </div>
  );
}
