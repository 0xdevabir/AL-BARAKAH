<script lang="ts">
  import { onMount } from 'svelte';
  import { api, message } from '#lib/app.ts';

  interface Window { weekday: number; startMinute: number; endMinute: number; slotMinutes: number }
  interface Row { weekday: number; start: string; end: string; slotMinutes: number }
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const toMinute = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  let rows = $state<Row[]>([]);
  let error = $state('');
  let saved = $state(false);
  let busy = $state(false);

  onMount(async () => {
    try {
      const me = await api.get<{ availability: Window[] }>('/doctor/me');
      rows = me.availability
        .toSorted((a, b) => a.weekday - b.weekday || a.startMinute - b.startMinute)
        .map((w) => ({ weekday: w.weekday, start: toTime(w.startMinute), end: toTime(w.endMinute), slotMinutes: w.slotMinutes }));
    } catch (err) { error = message(err); }
  });

  async function save(e: Event) {
    e.preventDefault();
    if (rows.some((r) => r.start >= r.end)) { error = 'Each start time must be before its end time.'; return; }
    busy = true; error = ''; saved = false;
    try {
      await api.put('/doctor/availability', { windows: rows.map((r) => ({ weekday: r.weekday, startMinute: toMinute(r.start), endMinute: toMinute(r.end), slotMinutes: Number(r.slotMinutes) })) });
      saved = true;
    } catch (err) { error = message(err); } finally { busy = false; }
  }
</script>

<div class="page">
  <h1 class="title">Availability</h1>
  <p class="muted small intro">Weekly hours, in Bangladesh time. Existing bookings stay as they are.</p>
  <form class="stack" onsubmit={save}>
    {#each rows as r, i (i)}
      <div class="card win">
        <label class="field"><span>Day</span><select class="input" bind:value={r.weekday}>{#each DAYS as d, n}<option value={n}>{d}</option>{/each}</select></label>
        <label class="field"><span>From</span><input class="input" type="time" bind:value={r.start} required /></label>
        <label class="field"><span>To</span><input class="input" type="time" bind:value={r.end} required /></label>
        <label class="field"><span>Minutes per call</span><input class="input" type="number" min="10" max="120" bind:value={r.slotMinutes} required /></label>
        <button type="button" class="btn danger small" onclick={() => rows.splice(i, 1)}>Remove</button>
      </div>
    {/each}
    <button type="button" class="btn" onclick={() => rows.push({ weekday: 0, start: '18:00', end: '21:00', slotMinutes: 20 })}>Add hours</button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if saved}<p role="status" class="small">Saved.</p>{/if}
    <button class="btn primary" disabled={busy}>Save</button>
  </form>
</div>

<style>
  .intro { margin-bottom: 16px; }
  .win { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; align-items: end; }
  .win :global(.input) { width: 100%; min-width: 0; }
</style>
