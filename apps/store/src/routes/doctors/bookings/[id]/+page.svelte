<script lang="ts">
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, openPayment } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Booking { id: string; code: string; startsAt: string; status: string; channel: string; doctor: { name: string; specialty: string; meetLink: string | null; whatsapp: string | null } }
  const id = $derived(page.params.id!);
  const payment = $derived(page.url.searchParams.get('payment'));
  let b = $state<Booking | null>(null);
  let error = $state('');
  let busy = $state(false);
  const label = (s: string) => (m as unknown as Record<string, () => string>)[`booking_status_${s}`]?.() ?? s;

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto(`/login?next=/doctors/bookings/${id}`, { replace: true }); return; }
    try { b = await api.get<Booking>(`/consultations/${id}`); } catch (err) { error = (err as Error).message; }
  });

  async function pay() {
    busy = true;
    try {
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'CONSULTATION', refId: id });
      await openPayment(redirectUrl);
    } catch (err) { error = (err as Error).message; } finally { busy = false; }
  }
</script>

<svelte:head><title>{m.my_bookings()} · AL-BARAKAH</title></svelte:head>

<div class="page stack">
  <a class="btn ghost small back" href="/doctors/bookings">‹ {m.my_bookings()}</a>
  {#if payment === 'success'}<p class="card ok" role="status">{m.pay_success()}</p>{/if}
  {#if payment === 'failed'}<p class="error" role="alert">{m.pay_failed()}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if b}
    <div>
      <h1 class="title st">{b.doctor.name}</h1>
      <p class="muted">{b.doctor.specialty}</p>
    </div>
    <div class="group">
      <div class="between"><span>{fmtWhen(b.startsAt)}</span><span class="chip">{label(b.status)}</span></div>
      <div class="between"><span class="muted">{m.call_type()}</span><span>{b.channel === 'GOOGLE_MEET' ? m.ch_GOOGLE_MEET() : m.ch_WHATSAPP()}</span></div>
    </div>
    {#if b.doctor.meetLink}<a class="btn primary block" href={b.doctor.meetLink} rel="noopener" target="_blank">{m.join_meet()}</a>{/if}
    {#if b.doctor.whatsapp}<a class="btn primary block" href="https://wa.me/{b.doctor.whatsapp.replace('+', '')}" rel="noopener" target="_blank">{m.open_whatsapp()}</a>{/if}
    {#if b.status === 'HOLD'}<button class="btn primary block" disabled={busy} onclick={pay}>{m.pay_now()}</button>{/if}
  {/if}
</div>

<style>
  .back { align-self: flex-start; padding-left: 0; }
  .st { margin-bottom: 2px; }
  .ok { background: var(--sage-soft); color: var(--accent-ink); font-weight: 600; }
  .between { justify-content: space-between; }
</style>
