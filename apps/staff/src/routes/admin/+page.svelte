<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen, Sheet } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api, message, statusLabel } from '#lib/app.ts';

  interface Order {
    id: string; code: string; status: string; type: string; promisedBy: string; totalPoisha: number; paymentMethod: string; paymentStatus: string; prescriptionKey: string | null; notes: string | null;
    addressSnapshot: { line: string; phone: string; zone: string };
    items: { id: string; nameSnapshot: string; qty: number }[];
    customer: { name: string; phone: string }; rider: { id: string; name: string } | null; payments: { id: string }[];
  }
  interface Rider { id: string; name: string; isActive: boolean }

  const FILTERS = ['', 'PLACED', 'CONFIRMED', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED', 'CANCELLED'];
  // What an admin may do next. The API's state machine has the final say.
  const NEXT: Record<string, string[]> = {
    PLACED: ['CONFIRMED', 'CANCELLED'], CONFIRMED: ['PACKED', 'CANCELLED'], PACKED: ['ASSIGNED', 'CANCELLED'],
    ASSIGNED: ['ASSIGNED', 'CANCELLED'], OUT_FOR_DELIVERY: ['FAILED'], FAILED: ['ASSIGNED', 'CANCELLED'],
  };

  let status = $state('PLACED');
  let pageNo = $state(1);
  let orders = $state<Order[]>([]);
  let riders = $state<Rider[]>([]);
  let selected = $state<Order | null>(null);
  let open = $state(false);
  let riderId = $state('');
  let note = $state('');
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try { orders = await api.get<Order[]>(`/admin/orders?page=${pageNo}${status ? `&status=${status}` : ''}`); } catch (err) { error = message(err); }
  }
  onMount(async () => {
    await load();
    try { riders = (await api.get<Rider[]>('/admin/staff?role=RIDER')).filter((r) => r.isActive); } catch (err) { error = message(err); }
  });

  function pick(o: Order) {
    selected = o;
    riderId = o.rider?.id ?? '';
    note = '';
    error = '';
    open = true;
  }
  async function move(to: string) {
    if (to === 'ASSIGNED' && !riderId) { error = 'Choose a delivery person first.'; return; }
    if (to === 'CANCELLED' && !confirm(`Cancel order ${selected!.code}?`)) return;
    busy = true;
    error = '';
    try {
      await api.patch(`/admin/orders/${selected!.id}/status`, { to, ...(to === 'ASSIGNED' ? { riderId } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      open = false;
      await load();
    } catch (err) { error = message(err); } finally { busy = false; }
  }
  async function prescription() {
    // Opened before the await: mobile browsers block popups that aren't tied directly to the tap.
    const tab = window.open('', '_blank');
    try {
      const { url } = await api.get<{ url: string }>(`/admin/orders/${selected!.id}/prescription`);
      if (tab) { tab.opener = null; tab.location.href = url; } else location.href = url;
    } catch (err) { tab?.close(); error = message(err); }
  }
  async function refund(paymentId: string) {
    if (!confirm('Refund this payment through bKash?')) return;
    busy = true;
    try { await api.post(`/payments/${paymentId}/refund`); open = false; await load(); } catch (err) { error = message(err); } finally { busy = false; }
  }
</script>

<div class="page">
  <h1 class="title">Orders</h1>
  <label class="field filter"><span>Status</span>
    <select class="input" bind:value={status} onchange={() => { pageNo = 1; void load(); }}>
      {#each FILTERS as f}<option value={f}>{f ? statusLabel(f) : 'All'}</option>{/each}
    </select>
  </label>
  {#if error && !open}<p class="error" role="alert">{error}</p>{/if}
  {#if orders.length === 0}<p class="empty">No orders here</p>{/if}
  <div class="group">
    {#each orders as o (o.id)}
      <button onclick={() => pick(o)}>
        <span class="grow">
          <span class="row wrap"><strong class="mono small">{o.code}</strong>
            {#if o.type === 'EMERGENCY'}<span class="chip warn">Emergency</span>{/if}
            <span class="chip">{statusLabel(o.status)}</span>
            {#if ['CANCELLED', 'FAILED'].includes(o.status) && o.payments.length}<span class="chip warn">Refund due</span>{/if}
          </span>
          <span class="muted small line">{o.customer.name || o.customer.phone} · {o.addressSnapshot.zone} · due {fmtWhen(o.promisedBy)}</span>
        </span>
        <span class="mono small">{formatTk(o.totalPoisha)}</span>
      </button>
    {/each}
  </div>
  {#if pageNo > 1 || orders.length > 0}
    <div class="row between pager">
      <button class="btn small" disabled={pageNo === 1} onclick={() => { pageNo -= 1; void load(); }}>Previous</button>
      <span class="muted small">Page {pageNo}</span>
      <button class="btn small" disabled={orders.length === 0} onclick={() => { pageNo += 1; void load(); }}>Next</button>
    </div>
  {/if}
</div>

<Sheet bind:open title={selected?.code ?? 'Order'}>
  {#if selected}
    <div class="stack">
      <div class="small stack">
        <span><a href="tel:{selected.customer.phone}">{selected.customer.name || 'Customer'} · {selected.customer.phone}</a></span>
        <span>{selected.addressSnapshot.line} ({selected.addressSnapshot.zone})</span>
        <span>Deliver to phone: <a href="tel:{selected.addressSnapshot.phone}">{selected.addressSnapshot.phone}</a></span>
        <span>{selected.paymentMethod} · {statusLabel(selected.paymentStatus)} · <span class="mono">{formatTk(selected.totalPoisha)}</span></span>
        {#if selected.notes}<span class="muted">{selected.notes}</span>{/if}
      </div>
      <ul class="items small">{#each selected.items as i (i.id)}<li>{i.nameSnapshot} × {i.qty}</li>{/each}</ul>
      {#if selected.prescriptionKey}<button class="btn small" onclick={prescription}>View prescription</button>{/if}

      {#if NEXT[selected.status]}
        {#if NEXT[selected.status].includes('ASSIGNED')}
          <label class="field"><span>Delivery person</span>
            <select class="input" bind:value={riderId}>
              <option value="">Choose</option>
              {#each riders as r (r.id)}<option value={r.id}>{r.name}</option>{/each}
            </select>
          </label>
        {/if}
        <label class="field"><span>Note (optional)</span><input class="input" bind:value={note} maxlength="300" /></label>
        <div class="row wrap">
          {#each NEXT[selected.status] as to}
            <button class="btn small" class:primary={to !== 'CANCELLED' && to !== 'FAILED'} class:danger={to === 'CANCELLED' || to === 'FAILED'} disabled={busy} onclick={() => move(to)}>
              {to === 'ASSIGNED' && selected.status === 'ASSIGNED' ? 'Reassign' : statusLabel(to)}
            </button>
          {/each}
        </div>
      {/if}
      {#if ['CANCELLED', 'FAILED'].includes(selected.status)}
        {#each selected.payments as p (p.id)}
          <button class="btn danger small" disabled={busy} onclick={() => refund(p.id)}>Refund bKash payment</button>
        {/each}
      {/if}
      {#if error}<p class="error" role="alert">{error}</p>{/if}
    </div>
  {/if}
</Sheet>

<style>
  .filter { max-width: 280px; margin-bottom: 16px; }
  .pager { justify-content: space-between; margin-top: 12px; }
  .line { display: block; }
  .items { margin: 0; padding-left: 18px; }
</style>
