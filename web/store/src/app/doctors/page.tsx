import Link from 'next/link';
import { BrandLockup } from '@/components/BrandLockup';

export default function DoctorsPage() {
  return (
    <div className="page stack" style={{ paddingTop: 28 }}>
      <BrandLockup size={26} />
      <h1 className="title">Doctors</h1>
      <p className="muted">Book a video or WhatsApp consultation with a licensed doctor.</p>
      <div className="empty">
        <p>Doctor booking is moving to Next.js. Sign in stays ready while we finish the schedule.</p>
        <Link className="btn primary" href="/login">
          Sign in first
        </Link>
      </div>
    </div>
  );
}
