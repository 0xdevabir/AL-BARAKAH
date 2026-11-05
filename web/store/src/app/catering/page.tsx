import Link from 'next/link';

export const metadata = { title: 'Catering · BarakaBari' };

export default function CateringPage() {
  return (
    <div className="page">
      <h1 className="title">Catering</h1>
      <section className="soon-card">
        <span className="soon-glyph" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <path d="M4 17a8 8 0 0 1 16 0Z" />
            <path d="M12 9V7.5M10.5 7.5h3M2.5 17h19M7 20h10" />
          </svg>
        </span>
        <span className="soon-chip">Upcoming</span>
        <h2>Food catering is on its way</h2>
        <p>Meals for events, gatherings and family occasions, delivered to your door.</p>
        <Link className="btn primary" href="/">
          Back to medicines
        </Link>
      </section>
    </div>
  );
}
