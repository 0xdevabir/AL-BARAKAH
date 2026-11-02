<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen, Segmented, Sheet } from '@albarakah/ui';
  import { goto } from '$app/navigation';
  import { api, openPayment } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';
  import type { Doctor } from './+page';

  let { data } = $props();
  type Channel = Doctor['channels'][number];
  interface Slot { start: string; end: string }

  let selected = $state<Doctor | null>(null);
  let open = $state(false);
  let slots = $state<Slot[]>([]);
  let startsAt = $state('');
  let channel = $state<Channel>('GOOGLE_MEET');
  let reason = $state('');
  let busy = $state(false);
  let error = $state('');

  const feeOf = (d: Doctor) => d.feePoisha ?? data.defaultFee;
  const channelLabel = (c: Channel) => (c === 'GOOGLE_MEET' ? m.ch_GOOGLE_MEET() : m.ch_WHATSAPP());

  async function choose(d: Doctor) {
    selected = d;
    channel = d.channels[0];
    startsAt = '';
    error = '';
    open = true;
    await refreshSlots();
  }
  async function refreshSlots() {
    try { slots = (await api.get<Slot[]>(`/doctors/${selected!.id}/slots`)).slice(0, 40); } catch (err) { error = (err as Error).message; }
  }

  async function book() {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto('/login?next=/doctors'); return; }
    busy = true;
    error = '';
    try {
      const c = await api.post<{ id: string }>('/consultations', { doctorId: selected!.id, startsAt, channel, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'CONSULTATION', refId: c.id });
      await openPayment(redirectUrl);
    } catch (err) {
      error = (err as Error).message;
      startsAt = '';
      await refreshSlots();
    } finally { busy = false; }
  }
</script>

<svelte:head>
  <title>{m.doctors_title()} · AL-BARAKAH</title>
  <meta name="description" content="Book a doctor in Bangladesh by Google Meet or WhatsApp call." />
</svelte:head>

<div class="page">
  <h1 class="title">{m.doctors_title()}</h1>
  <a class="btn small mine" href="/doctors/bookings">{m.my_bookings()}</a>
  {#if data.doctors.length === 0}
    <p class="empty">{m.doctors_empty()}</p>
  {:else}
    <div class="stack">
      {#each data.doctors as d (d.id)}
        <article class="card stack">
          <div>
            <h2 class="name">{d.name}</h2>
            <p class="muted small">{d.specialty} · {m.bmdc()} <span class="mono">{d.bmdcNo}</span></p>
          </div>
          {#if d.bio}<p class="small">{d.bio}</p>{/if}
          <div class="row between">
            <span class="mono">{formatTk(feeOf(d))}</span>
            <button class="btn primary small" onclick={() => choose(d)}>{m.book()}</button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<Sheet bind:open title={selected?.name ?? m.book()}>
  {#if selected}
    <div class="stack">
      {#if selected.channels.length > 1}
        <Segmented label={m.call_type()} bind:value={channel} options={selected.channels.map((c) => ({ value: c, label: channelLabel(c) }))} />
      {/if}
      <div class="field">
        <span>{m.choose_slot()}</span>
        {#if slots.length === 0}
          <p class="muted">{m.no_slots()}</p>
        {:else}
          <select class="input" bind:value={startsAt} aria-label={m.choose_slot()}>
            <option value="" disabled>{m.choose_slot()}</option>
            {#each slots as s (s.start)}<option value={s.start}>{fmtWhen(s.start)}</option>{/each}
          </select>
        {/if}
      </div>
      <label class="field"><span>{m.reason()}</span><textarea class="input" bind:value={reason} maxlength="500"></textarea></label>
      <p class="muted small">{m.hold_note()}</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn primary block" disabled={!startsAt || busy} onclick={book}>{m.pay_and_book({ fee: formatTk(feeOf(selected)) })}</button>
    </div>
  {/if}
</Sheet>

<style>
  .mine { margin-bottom: 16px; background: var(--raised); }
  .name { font-size: 1.1rem; }
</style>
