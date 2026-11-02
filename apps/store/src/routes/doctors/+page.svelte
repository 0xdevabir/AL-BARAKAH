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
  let loadingSlots = $state(false);

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
    loadingSlots = true;
    try { slots = (await api.get<Slot[]>(`/doctors/${selected!.id}/slots`)).slice(0, 40); }
    catch (err) { error = (err as Error).message; }
    finally { loadingSlots = false; }
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
  <h1 class="title tab-title">{m.doctors_title()}</h1>
  <div class="group">
    <a class="chev" href="/doctors/bookings">{m.my_bookings()}</a>
  </div>
  {#if data.doctors.length === 0}
    <div class="empty"><p>{m.doctors_empty()}</p></div>
  {:else}
    <div class="stack list">
      {#each data.doctors as d (d.id)}
        <button class="card doctor" type="button" onclick={() => choose(d)}>
          <span class="row between">
            <strong>{d.name}</strong>
            <span class="price">{formatTk(feeOf(d))}</span>
          </span>
          <span class="muted line">{d.specialty}</span>
          <span class="muted small line">{m.bmdc()} <span class="mono">{d.bmdcNo}</span></span>
          {#if d.bio}<span class="muted small note">{d.bio}</span>{/if}
        </button>
      {/each}
    </div>
  {/if}
</div>

<Sheet bind:open title={selected?.name ?? m.book()}>
  {#if selected}
    <div class="stack sheet">
      <div class="who">
        <span class="muted">{selected.specialty}</span>
        <span class="row between"><span class="muted small">{m.bmdc()} <span class="mono">{selected.bmdcNo}</span></span><span class="price">{formatTk(feeOf(selected))}</span></span>
      </div>
      {#if selected.channels.length > 1}
        <Segmented label={m.call_type()} bind:value={channel} options={selected.channels.map((c) => ({ value: c, label: channelLabel(c) }))} />
      {:else}
        <p class="muted small">{channelLabel(selected.channels[0])}</p>
      {/if}
      <div class="field">
        <span>{m.choose_slot()}</span>
        {#if loadingSlots}
          <p class="muted small">…</p>
        {:else if slots.length === 0}
          <div class="empty slots"><p>{m.no_slots()}</p></div>
        {:else}
          <div class="group slots" role="radiogroup" aria-label={m.choose_slot()}>
            {#each slots as s (s.start)}
              <button type="button" role="radio" aria-checked={startsAt === s.start} onclick={() => (startsAt = s.start)}>
                <span class="grow">{fmtWhen(s.start)}</span>
                <span class="mark" class:on={startsAt === s.start}></span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
      <label class="field"><span>{m.reason()}</span><textarea class="input" bind:value={reason} maxlength="500"></textarea></label>
      <p class="muted small">{m.hold_note()}</p>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <button class="btn primary block" disabled={!startsAt || busy || slots.length === 0} onclick={book}>{m.pay_and_book({ fee: formatTk(feeOf(selected)) })}</button>
    </div>
  {/if}
</Sheet>

<style>
  .list { margin-top: 16px; }
  .doctor { display: flex; flex-direction: column; align-items: stretch; gap: 4px; width: 100%; border: 0; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .line, .note { display: block; }
  .note { margin-top: 4px; }
  .who { display: flex; flex-direction: column; gap: 6px; }
  .slots.empty { padding: 28px 18px; }
  .mark { flex: none; width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line); }
  .mark.on { background: var(--accent); box-shadow: none; }
</style>
