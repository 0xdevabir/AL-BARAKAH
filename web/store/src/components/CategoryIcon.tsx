const TABLET = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5 12h14';
const PATHS: Record<string, string> = {
  'fever-pain': 'M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0Z',
  antibiotics: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7',
  diabetes: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
  'heart-blood-pressure': 'M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11Z',
  'stomach-digestion': 'M3 11h18a9 9 0 0 1-18 0ZM9 20h6M8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4',
  'cold-allergy': 'M12 2v20M3.300 7l17.400 10M20.700 7 3.300 17',
  'skin-hair': 'm12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z',
};

export function CategoryIcon({ slug }: { slug: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[slug] ?? TABLET} />
    </svg>
  );
}
