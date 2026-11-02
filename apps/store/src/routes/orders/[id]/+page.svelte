<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen, fmtWindow } from '@albarakah/ui';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { api, openPayment } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Order {
    id: string; code: string; status: string; type: string; promisedBy: string; slotStart: string | null; slotEnd: string | null;
    subtotalPoisha: number; deliveryFeePoisha: number; emergencyFeePoisha: number; totalPoisha: number;
    paymentMethod: 'COD' | 'BKASH'; paymentStatus: string;
    addressSnapshot: { label: string; line: string };
    items: { id: string; nameSnapshot: string; qty: number; unitPricePoisha: number }[];
    events: { id: string; toStatus: string; createdAt: string }[];
    rider: { name: string; phone: string } | null;
  }

  const id = $derived(page.params.id!);
  const payment = $derived(page.url.searchParams.get('payment'));
  const placed = $derived(page.url.searchParams.has('placed'));
  let order = $state<Order | null>(null);
  let error = $state('');
  let busy = $state(false);
  let now = $state(Date.now());
  let stream: EventSource | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;

  const statusLabel = (s: string) => (m as unknown as Record<string, () => string>)[`status_${s}`]?.() ?? s;
  const active = $derived(!!order && !['DELIVERED', 'CANCELLED', 'FAILED'].includes(order.status));
  const left = $derived(order ? new Date(order.promisedBy).getTime() - now : 0);
  const countdown = $derived.by(() => {
    const s = Math.max(0, Math.floor(left / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  async function load() {
    try { order = await api.get<Order>(`/orders/${id}`); } catch (err) { error = (err as Error).message; }
  }

  /** Reconnects with a fresh ticket, because tickets work once and mobile networks drop often. */
  async function listen() {
    if (closed || !active) return;
    try {
      const { ticket } = await api.post<{ ticket: string }>(`/orders/${id}/events/ticket`);
      stream = new EventSource(`${api.base}/orders/events/stream?ticket=${encodeURIComponent(ticket)}`);
      stream.onmessage = () => void load();
      stream.onerror = () => {
        stream?.close();
        if (!closed) setTimeout(() => void load().then(listen), 5000);
      };
    } catch {
      if (!closed) setTimeout(listen, 15_000);
    }
  }

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto(`/login?next=/orders/${id}`, { replace: true }); return; }
    await load();
    timer = setInterval(() => (now = Date.now()), 1000);
    void listen();
  });
  onDestroy(() => {
    closed = true;
    stream?.close();
    clearInterval(timer);
  });

  async function cancel() {
    busy = true;
    try { await api.post(`/orders/${id}/cancel`); await load(); } catch (err) { error = (err as Error).message; } finally { busy = false; }
  }
  async function pay() {
    busy = true;
    try {
      const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'ORDER', refId: id });
      await openPayment(redirectUrl);
    } catch (err) { error = (err as Error).message; } finally { busy = false; }
  }
</script>

<svelte:head><title>{order?.code ?? m.tab_orders()} · AL-BARAKAH</title></svelte:head>

<div class="page stack">
  <a class="btn ghost small back" href="/orders">‹ {m.tab_orders()}</a>
  {#if placed}<p class="card ok" role="status">{m.order_placed()}</p>{/if}
  {#if payment === 'success'}<p class="card ok" role="status">{m.pay_success()}</p>{/if}
  {#if payment === 'failed'}<p class="error" role="alert">{m.pay_failed()}</p>{/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  {#if order}
    <div>
      <h1 class="title st">{statusLabel(order.status)}</h1>
      <p class="mono small muted">{order.code}</p>
    </div>

    {#if active && order.type === 'EMERGENCY'}
      <div class="card row between">
        <span>{left > 0 ? m.arrives_in() : m.late()}</span>
        {#if left > 0}<strong class="mono timer" role="timer">{countdown}</strong>{/if}
      </div>
    {:else if active}
      <div class="card">{order.slotStart ? fmtWindow(order.slotStart, order.slotEnd!) : fmtWhen(order.promisedBy)}</div>
    {/if}

    {#if order.rider}<a class="btn primary block" href="tel:{order.rider.phone}">{m.call_rider({ name: order.rider.name })}</a>{/if}

    {#if order.paymentMethod === 'BKASH' && order.paymentStatus !== 'PAID' && order.paymentStatus !== 'REFUNDED' && order.status !== 'CANCELLED'}
      <button class="btn primary block" disabled={busy} onclick={pay}>{m.pay_now()}</button>
    {/if}

    <ol class="group trail">
      {#each order.events as e, i (e.id)}
        <li><span class="dot" class:now={i === order.events.length - 1}></span><span class="grow">{statusLabel(e.toStatus)}</span><span class="muted small">{fmtWhen(e.createdAt)}</span></li>
      {/each}
    </ol>

    <h2 class="section">{m.items()}</h2>
    <div class="group">
      {#each order.items as i (i.id)}
        <div class="between"><span>{i.nameSnapshot} × {i.qty}</span><span class="price">{formatTk(i.unitPricePoisha * i.qty)}</span></div>
      {/each}
      <div class="between"><span>{m.delivery_fee()}</span><span class="price">{formatTk(order.deliveryFeePoisha)}</span></div>
      {#if order.emergencyFeePoisha}<div class="between"><span>{m.emergency_fee()}</span><span class="price">{formatTk(order.emergencyFeePoisha)}</span></div>{/if}
      <div class="between"><strong>{m.total()}</strong><strong class="price">{formatTk(order.totalPoisha)}</strong></div>
    </div>

    <div class="card stack small">
      <span>{order.addressSnapshot.label}: {order.addressSnapshot.line}</span>
      <span class="muted">{order.paymentMethod === 'COD' ? m.pay_cod() : m.pay_bkash()} · {order.paymentStatus === 'PAID' ? m.paid() : m.unpaid()}</span>
    </div>

    {#if order.status === 'PLACED'}<button class="btn danger block" disabled={busy} onclick={cancel}>{m.cancel_order()}</button>{/if}
  {/if}
</div>

<style>
  .back { align-self: flex-start; padding-left: 0; }
  .st { margin-bottom: 2px; }
  .ok { background: var(--sage-soft); color: var(--accent-ink); font-weight: 600; }
  .between { justify-content: space-between; }
  .timer { font-size: 1.5rem; }
  .trail { margin: 0; padding: 0; list-style: none; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--sage); }
  .dot.now { background: var(--accent); box-shadow: 0 0 0 4px var(--sage-soft); }
</style>
