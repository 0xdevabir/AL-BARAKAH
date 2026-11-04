import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';

export default function SearchPage() {
  return (
    <div className="page stack" style={{ paddingTop: 28 }}>
      <BrandLockup size={26} />
      <h1 className="title">Search</h1>
      <p className="muted">Find medicines by name, brand, or category.</p>
      <label className="field">
        Medicine or brand
        <input className="input" placeholder="e.g. Napa, Square, syrup" disabled />
      </label>
      <div className="empty">
        <p>Full search is coming next. Browse categories from home in the meantime.</p>
        <Link className="btn primary" href="/">
          Back home
        </Link>
      </div>
    </div>
  );
}
