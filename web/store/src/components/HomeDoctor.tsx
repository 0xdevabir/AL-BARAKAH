'use client';

import { initials } from '@albarakah/ui';
import Link from 'next/link';
import { type Doctor, nextLine } from '@/lib/doctors';

/** Home-page promo for consultations, showing the soonest free doctor when there is one. */
export function HomeDoctor({ doctors }: { doctors: Doctor[] }) {
  const soonest = doctors
    .filter((d) => d.nextSlot)
    .sort((a, b) => Date.parse(a.nextSlot!.start) - Date.parse(b.nextSlot!.start))[0];
  const faces = doctors.slice(0, 3);

  return (
    <Link href="/doctors" className="home-doctor">
      <span className="home-doctor-top">
        <span className="home-doctor-faces" aria-hidden="true">
          {faces.length ? (
            faces.map((d) => <span key={d.id}>{initials(d.name.replace(/^dr\.?\s+/i, ''))}</span>)
          ) : (
            <span>
              <svg viewBox="0 0 24 24">
                <path d="M12 21s-7-4.8-7-10a4.2 4.2 0 0 1 7-3 4.2 4.2 0 0 1 7 3c0 5.2-7 10-7 10Z" />
              </svg>
            </span>
          )}
        </span>
        <span className="home-doctor-cta">Book a consult</span>
      </span>
      <strong>Not sure what to take? Ask a doctor.</strong>
      <span className="home-doctor-body">
        BMDC-registered doctors on video or WhatsApp. The prescription lands in your account, ready to order from.
      </span>
      {soonest?.nextSlot ? (
        <span className="home-doctor-next">
          <span className="dot" aria-hidden="true" />
          Next opening {nextLine(soonest.nextSlot)} with {soonest.name}
        </span>
      ) : null}
    </Link>
  );
}
