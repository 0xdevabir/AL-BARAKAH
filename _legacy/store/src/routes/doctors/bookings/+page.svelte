<script lang="ts">
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Row { id: string; code: string; startsAt: string; status: string; channel: string; doctor: { specialty: string; user: { name: string } } }
  let rows = $state<Row[] | null>(null);
  let error = $state('');
  const label = (s: string) => (m as unknown as Record<string, () => string>)[`booking_status_${s}`]?.() ?? s;
  const channelLabel = (c: string) => (c === 'GOOGLE_MEET' ? m.ch_GOOGLE_MEET() : m.ch_WHATSAPP());

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto('/login?next=/doctors/bookings', { replace: true }); return; }
    try { rows = await api.get<Row[]>('/consultations'); } catch (err) { error = (err as Error).message; rows = []; }
  });
</script>

<svelte:head><title>{m.my_bookings()} · BarakaBari</title></svelte:head>

<div class="page">
  <a class="btn ghost small back" href="/doctors">‹ {m.doctors_title()}</a>
  <h1 class="title">{m.my_bookings()}</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if rows && rows.length === 0}
    <div class="empty stack">
      <p>{m.bookings_empty()}</p>
      <a class="btn primary" href="/doctors">{m.doctors_title()}</a>
    </div>
  {:else if rows}
    <div class="stack">
      {#each rows as r (r.id)}
        <a class="card booking" href="/doctors/bookings/{r.id}">
          <span class="row between">
            <strong>{r.doctor.user.name}</strong>
            <span class="chip" class:off={r.status === 'COMPLETED' || r.status === 'CANCELLED' || r.status === 'REFUNDED'} class:warn={r.status === 'HOLD' || r.status === 'NO_SHOW'}>{label(r.status)}</span>
          </span>
          <span class="muted">{r.doctor.specialty}</span>
          <span>{fmtWhen(r.startsAt)}</span>
          <span class="muted small">{channelLabel(r.channel)}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>

<style>
  .back { padding-left: 0; }
  .booking { display: flex; flex-direction: column; align-items: stretch; gap: 4px; }
</style>
