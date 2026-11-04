<script lang="ts">
  let { slug }: { slug: string } = $props();

  const TABLET = 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5 12h14';
  const PATHS: Record<string, string> = {
    'fever-pain': 'M14 14.76V5a2 2 0 1 0-4 0v9.76a4 4 0 1 0 4 0Z',
    antibiotics: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7',
    diabetes: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z',
    'heart-blood-pressure': 'M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11Z',
    'stomach-digestion': 'M3 11h18a9 9 0 0 1-18 0ZM9 20h6M8 7c0-2 2-2 2-4M13 7c0-2 2-2 2-4',
    'antivirals-antifungals-antiparasitics': 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 2v5M12 17v5M2 12h5M17 12h5M5 5l3.5 3.5M15.5 15.5 19 19M19 5l-3.500 3.500M8.500 15.500 5 19',
    'asthma-breathing': 'M3 8h11a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h8a3 3 0 1 1-3 3',
    'skin-hair': 'm12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Z',
    'cold-allergy': 'M12 2v20M3.300 7l17.400 10M20.700 7 3.300 17',
    'brain-nerves-mental-health': 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V6a2 2 0 0 0-3-2ZM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1',
    'women-s-health': 'M12 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10ZM12 13v8M9 18h6',
    'men-s-health-urology': 'M10 9a6 6 0 1 0 0 12 6 6 0 0 0 0-12ZM14.500 10.500 21 3M15 3h6v6',
    'hormones-thyroid': 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.500 15h9',
    'bone-joint-gout': 'm8 16 8-8M16 8a2.500 2.500 0 1 1 3-3 2.500 2.500 0 1 1-3 3ZM8 16a2.500 2.500 0 1 1-3 3 2.500 2.500 0 1 1 3-3Z',
    'eye-ear': 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z',
    'iv-fluids-hospital-care': 'M8 3h8a1 1 0 0 1 1 1v9a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V4a1 1 0 0 1 1-1ZM12 17v4M7 8h4',
    'vaccines-immunology': 'm18 2 4 4M17 7l3-3M19 9 8.700 19.300a2.400 2.400 0 0 1-3.400 0l-.6-.6a2.400 2.400 0 0 1 0-3.400L15 5M9 11l4 4M5 19l-3 3M14 4l6 6',
    'cancer-care': 'M12 3a4 4 0 0 0-4 4c0 3 2 6 8 14M12 3a4 4 0 0 1 4 4c0 3-2 6-8 14',
    'herbal-natural': 'M5 19C5 10 11 4 20 4c0 9-6 15-15 15Zm0 0 8-8',
    'medical-devices-care': 'M6 3H5v6a5 5 0 0 0 10 0V3h-1M10 14v2a4 4 0 0 0 8 0v-2M18 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  };
</script>

<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={PATHS[slug] ?? TABLET} /></svg>
