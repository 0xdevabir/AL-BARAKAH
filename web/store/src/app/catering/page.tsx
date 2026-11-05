import { EmptyState } from '@albarakah/ui';
import Link from 'next/link';

export const metadata = { title: 'Catering · BarakaBari' };

export default function CateringPage() {
  return (
    <div className="page">
      <h1 className="title">Catering</h1>
      <EmptyState
        icon="🍽️"
        title="Upcoming"
        action={
          <Link className="btn primary" href="/">
            Back to medicines
          </Link>
        }
      >
        Food catering for events and gatherings is coming soon.
      </EmptyState>
    </div>
  );
}
