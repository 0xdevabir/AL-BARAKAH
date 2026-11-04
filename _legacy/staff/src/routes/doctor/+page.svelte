<script lang="ts">
  import { fmtWhen } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api, message, statusLabel } from '#lib/app.ts';

  interface Booking { id: string; code: string; startsAt: string; status: string; channel: string; reason: string | null; patientPhone: string; notes: string | null; customer: { name: string } }
  let rows = $state<Booking[] | null>(null);
  let drafts = $state<Record<string, string>>({});
  let error = $state('');
  let busy = $state(false);

  async function load() {
    try { rows = await api.get<Booking[]>('/doctor/bookings'); } catch (err) { error = message(err); }
  }
  let meetLink = $state<string | null>(null);
  onMount(async () => {
    await load();
    try { meetLink = (await api.get<{ meetLink: string | null }>('/doctor/me')).meetLink; } catch (err) { error = message(err); }
  });

  async function finish(b: Booking, status: 'COMPLETED' | 'NO_SHOW') {
    busy = true;
    error = '';
    const notes = drafts[b.id]?.trim();
    try { await api.patch(`/doctor/bookings/${b.id}`, { status, ...(notes ? { notes } : {}) }); await load(); } catch (err) { error = message(err); } finally { busy = false; }
  }
</script>

<div class="page stack">
  <h1 class="title">Bookings</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  {#if rows?.length === 0}<p class="empty">No bookings yet</p>{/if}
  {#each rows ?? [] as b (b.id)}
    <article class="card stack">
      <div class="row wrap"><strong>{fmtWhen(b.startsAt)}</strong><span class="chip">{statusLabel(b.status)}</span></div>
      <div>
        <p>{b.customer.name || 'Patient'} · <a class="mono" href="tel:{b.patientPhone}">{b.patientPhone}</a></p>
        <p class="muted small">{statusLabel(b.channel)}</p>
        {#if b.reason}<p class="small">{b.reason}</p>{/if}
      </div>
      {#if b.status === 'CONFIRMED'}
        {#if b.channel === 'WHATSAPP'}<a class="btn" href="https://wa.me/{b.patientPhone.replace('+', '')}" rel="noopener" target="_blank">Open WhatsApp</a>{/if}
        {#if b.channel === 'GOOGLE_MEET' && meetLink}<a class="btn" href={meetLink} rel="noopener" target="_blank">Open Google Meet</a>{/if}
        <label class="field"><span>Private notes (optional)</span><textarea class="input" bind:value={drafts[b.id]} maxlength="2000"></textarea></label>
        <div class="row wrap">
          <button class="btn primary grow" disabled={busy} onclick={() => finish(b, 'COMPLETED')}>Mark completed</button>
          <button class="btn danger" disabled={busy} onclick={() => finish(b, 'NO_SHOW')}>Patient missed it</button>
        </div>
      {:else if b.notes}
        <p class="small muted">{b.notes}</p>
      {/if}
    </article>
  {/each}
</div>
