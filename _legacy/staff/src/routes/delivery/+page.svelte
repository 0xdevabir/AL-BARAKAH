<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen } from '@albarakah/ui';
  import { onDestroy, onMount } from 'svelte';
  import { api, message } from '#lib/app.ts';

  interface Job {
    id: string; code: string; status: 'ASSIGNED' | 'OUT_FOR_DELIVERY'; type: string; promisedBy: string; totalPoisha: number; paymentMethod: string; paymentStatus: string; riderPayoutPoisha: number; notes: string | null;
    addressSnapshot: { label: string; line: string; phone: string; notes?: string; zone: string };
    customer: { name: string }; items: { nameSnapshot: string; qty: number }[];
  }
  let jobs = $state<Job[] | null>(null);
  let error = $state('');
  let busy = $state(false);
  let timer: ReturnType<typeof setInterval>;

  async function load() {
    try { jobs = await api.get<Job[]>('/delivery/jobs'); } catch (err) { error = message(err); }
  }
  onMount(() => {
    void load();
    timer = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
  });
  onDestroy(() => clearInterval(timer));

  async function move(job: Job, to: string) {
    let note: string | undefined;
    if (to === 'FAILED') {
      const reason = prompt('Why could the delivery not be completed?');
      if (reason === null) return;
      note = reason.trim() || undefined;
    }
    if (to === 'DELIVERED' && collect(job) && !confirm(`Did you collect ${formatTk(job.totalPoisha)} in cash?`)) return;
    busy = true;
    error = '';
    try { await api.patch(`/delivery/jobs/${job.id}/status`, { to, ...(note ? { note } : {}) }); await load(); } catch (err) { error = message(err); } finally { busy = false; }
  }
  const collect = (j: Job) => j.paymentMethod === 'COD' && j.paymentStatus !== 'PAID';
</script>

<div class="page stack">
  <h1 class="title">Jobs</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if jobs?.length === 0}<p class="empty">No deliveries assigned to you right now</p>{/if}
  {#each jobs ?? [] as j (j.id)}
    <article class="card stack">
      <div class="row wrap">
        <strong class="mono small">{j.code}</strong>
        {#if j.type === 'EMERGENCY'}<span class="chip warn">Emergency</span>{/if}
        <span class="muted small">by {fmtWhen(j.promisedBy)}</span>
      </div>
      <div>
        <strong>{j.customer.name || j.addressSnapshot.label}</strong>
        <p>{j.addressSnapshot.line}</p>
        <p class="muted small">{j.addressSnapshot.zone}{j.addressSnapshot.notes ? ` · ${j.addressSnapshot.notes}` : ''}</p>
        {#if j.notes}<p class="small">Note: {j.notes}</p>{/if}
      </div>
      <p class="small">{j.items.map((i) => `${i.nameSnapshot} × ${i.qty}`).join(', ')}</p>
      <p class="collect">
        {#if collect(j)}Collect <strong class="mono">{formatTk(j.totalPoisha)}</strong> cash{:else}Already paid, collect nothing{/if}
      </p>
      <div class="row wrap">
        <a class="btn" href="tel:{j.addressSnapshot.phone}">Call customer</a>
        {#if j.status === 'ASSIGNED'}
          <button class="btn primary grow" disabled={busy} onclick={() => move(j, 'OUT_FOR_DELIVERY')}>Start delivery</button>
        {:else}
          <button class="btn danger" disabled={busy} onclick={() => move(j, 'FAILED')}>Failed</button>
          <button class="btn primary grow" disabled={busy} onclick={() => move(j, 'DELIVERED')}>Delivered</button>
        {/if}
      </div>
    </article>
  {/each}
</div>

<style>
  .collect { padding: 10px 12px; border-radius: 12px; background: var(--surface); }
</style>
