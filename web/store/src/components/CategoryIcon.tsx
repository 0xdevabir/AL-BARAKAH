/** Line icons for catalogue categories; one path string per slug (subpaths joined with "M"). */
const TABLET = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5 12h14';
const STOMACH = 'M3 11h18a9 9 0 0 1-18 0ZM9 20h6M8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4';
const HEART = 'M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11Z';

const PATHS: Record<string, string> = {
  'fever-pain': 'M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0Z',
  antibiotics: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7',
  diabetes: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  'diabetes-heart': HEART,
  stomach: STOMACH,
  'stomach-digestion': STOMACH,
  'heart-blood-pressure': `${HEART}M7 12h2.5l1.5-3 2 6 1.5-3H17`,
  'cold-allergy': 'M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17',
  'skin-hair': 'm12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z',
  'antivirals-antifungals-antiparasitics':
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 3v5M12 16v5M3 12h5M16 12h5M5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6',
  'asthma-breathing': 'M12 4v8M12 12c-2 0-3 1-4 3s-2 5-4 5c-1 0-1-2-1-4 0-5 3-8 5-8M12 12c2 0 3 1 4 3s2 5 4 5c1 0 1-2 1-4 0-5-3-8-5-8',
  'brain-nerves-mental-health':
    'M9.5 4A3 3 0 0 0 6.6 7.8 3.5 3.5 0 0 0 5 14a3 3 0 0 0 4.5 4.5V4ZM14.5 4a3 3 0 0 1 2.9 3.8A3.5 3.5 0 0 1 19 14a3 3 0 0 1-4.5 4.5V4ZM9.5 4a2.5 2.5 0 0 1 5 0M9.5 20h5',
  'women-s-health': 'M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 13v8M9 18h6',
  'men-s-health-urology': 'M10 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM14.5 9.5 21 3M15 3h6v6',
  'hormones-thyroid': 'M12 4c-1.5 2-4 2-5.5 4S5 13 7 15s3.5 1 5 0c1.5 1 3 2 5 0s1.5-5 0-7S13.5 6 12 4ZM12 6v9',
  'bone-joint-gout':
    'M17 10c.7-.7 1.7-.6 2.4-1.3a2 2 0 0 0-2.8-2.9 2 2 0 0 0-2.9-2.8c-.7.7-.6 1.7-1.3 2.4L7.6 10.2c-.7.7-1.7.6-2.4 1.3a2 2 0 0 0 2.8 2.9 2 2 0 0 0 2.9 2.8c.7-.7.6-1.7 1.3-2.4Z',
  'eye-ear': 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
  'vitamins-supplements': 'M8 3h8M9 3v3l-2 3v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V9l-2-3V3M7 13h10',
  'iv-fluids-hospital-care': 'M8 2h8v10a4 4 0 0 1-8 0V2ZM8 7h8M12 16v3a2 2 0 0 0 2 2h3',
  'vaccines-immunology': 'm18 2 4 4M17 7l3-3M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6',
  'cancer-care': 'M12 3c-2.5 0-4 2-4 4.5 0 3 2.5 6 4 8.5 1.5-2.5 4-5.5 4-8.5C16 5 14.5 3 12 3ZM9.5 13 6 21M14.5 13 18 21',
  'herbal-natural': 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10ZM2 21c0-3 1.9-5.4 5.2-6.1C9.6 14.4 12 13 13 11',
  'medical-devices-care': 'M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 12 0V4a2 2 0 0 0-2-2h-1M8 15a6 6 0 0 0 12 0v-3M20 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
};

export function CategoryIcon({ slug }: { slug: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[slug] ?? TABLET} />
    </svg>
  );
}
