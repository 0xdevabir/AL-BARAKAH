<script lang="ts">
  let { form }: { form: string } = $props();

  // Simple drawings instead of photos: nothing to download, and they never show the wrong product.
  const PATHS: Record<string, string> = {
    tablet: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM5 12h14',
    capsule: 'm10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7',
    liquid: 'M9 3h6M10 3v4L7 10v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9l-3-3V3M7 14h10',
    injection: 'm18 2 4 4M17 7l3-3M19 9 8.7 19.3a2.4 2.4 0 0 1-3.4 0l-.6-.6a2.4 2.4 0 0 1 0-3.4L15 5M9 11l4 4M5 19l-3 3M14 4l6 6',
    topical: 'M8 3h8l1 5H7l1-5ZM7 8h10l-1 13H8L7 8Z',
    drops: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11Z',
    inhaler: 'M9 3h6v9H9zM7 12h10v5a4 4 0 0 1-4 4H7v-9Z',
  };
  const kind = $derived.by(() => {
    const f = form.toLowerCase();
    if (/capsule/.test(f)) return 'capsule';
    if (/syrup|suspension|solution|liquid/.test(f)) return 'liquid';
    if (/inject|vial/.test(f)) return 'injection';
    if (/cream|ointment|gel|lotion/.test(f)) return 'topical';
    if (/drop/.test(f)) return 'drops';
    if (/inhal/.test(f)) return 'inhaler';
    return 'tablet';
  });
</script>

<span class="glyph" aria-hidden="true">
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d={PATHS[kind]} /></svg>
</span>

<style>
  .glyph { display: grid; place-items: center; flex: none; width: 48px; height: 48px; border-radius: 14px; background: var(--sage-soft); color: var(--accent-ink); }
</style>
