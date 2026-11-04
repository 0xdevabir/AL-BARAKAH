import Link from 'next/link';

export default function StaffHome() {
  return (
    <div className="stack">
      <div className="staff-hero">
        <h1 className="title">Staff portals</h1>
        <p className="muted">Quiet tools for the people who keep BarakaBari running — never shipped to customers.</p>
      </div>
      <div className="portal-grid">
        <Link className="portal-card" href="/admin">
          <strong>Admin</strong>
          <span className="muted small">Catalog, people, settings, and consultations.</span>
          <span className="go">Open admin</span>
        </Link>
        <Link className="portal-card" href="/delivery">
          <strong>Delivery</strong>
          <span className="muted small">Assigned runs and rider earnings.</span>
          <span className="go">Open delivery</span>
        </Link>
        <Link className="portal-card" href="/doctor">
          <strong>Doctor</strong>
          <span className="muted small">Upcoming consultations and notes.</span>
          <span className="go">Open doctor</span>
        </Link>
      </div>
    </div>
  );
}
