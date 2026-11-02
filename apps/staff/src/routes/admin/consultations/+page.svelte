<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api, message, statusLabel } from '#lib/app.ts';

  interface Row {
    id: string; code: string; startsAt: string; status: string; channel: string; feePoisha: number;
    customer: { name: string; phone: string }; doctor: { user: { name: string } };
    payments: { id: string; status: string; trxId: string | null }[];
  }
  let rows = $state<Row[]>([]);
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try { rows = await api.get<Row[]>('/admin/consultations'); } catch (err) { error = message(err); }
  }
  onMount(load);

  async function refund(id: string) {
    if (!confirm('Refund this booking through bKash?')) return;
    busy = true;
    error = '';
    try { await api.post(`/payments/${id}/refund`); await load(); } catch (err) { error = message(err); } finally { busy = false; }
  }
</script>

<div class="page">
  <h1 class="title">Doctor bookings</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if rows.length === 0}<p class="empty">No bookings yet</p>{/if}
  <div class="group">
    {#each rows as r (r.id)}
      <div>
        <div class="grow">
          <div class="row wrap"><strong class="mono small">{r.code}</strong><span class="chip">{statusLabel(r.status)}</span></div>
          <div class="small">{r.doctor.user.name} with {r.customer.name || r.customer.phone}</div>
          <div class="muted small">{fmtWhen(r.startsAt)} · {statusLabel(r.channel)} · <span class="mono">{formatTk(r.feePoisha)}</span></div>
        </div>
        {#each r.payments.filter((p) => p.status === 'PAID') as p (p.id)}
          <button class="btn danger small" disabled={busy} onclick={() => refund(p.id)}>Refund</button>
        {/each}
      </div>
    {/each}
  </div>
</div>
