<script lang="ts">
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Row { id: string; code: string; startsAt: string; status: string; doctor: { specialty: string; user: { name: string } } }
  let rows = $state<Row[]>([]);
  let error = $state('');
  const label = (s: string) => (m as unknown as Record<string, () => string>)[`booking_status_${s}`]?.() ?? s;

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto('/login?next=/doctors/bookings', { replaceState: true }); return; }
    try { rows = await api.get<Row[]>('/consultations'); } catch (err) { error = (err as Error).message; }
  });
</script>

<svelte:head><title>{m.my_bookings()} · AL-BARAKAH</title></svelte:head>

<div class="page">
  <a class="btn ghost small back" href="/doctors">‹ {m.doctors_title()}</a>
  <h1 class="title">{m.my_bookings()}</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="group">
    {#each rows as r (r.id)}
      <a class="chev" href="/doctors/bookings/{r.id}">
        <span class="grow"><strong>{r.doctor.user.name}</strong><span class="muted small line">{fmtWhen(r.startsAt)}</span></span>
        <span class="chip">{label(r.status)}</span>
      </a>
    {/each}
  </div>
</div>

<style>
  .back { padding-left: 0; }
  .line { display: block; }
</style>
