<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { Segmented, Sheet } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api, message, tkToPoisha } from '#lib/app.ts';

  interface Staff { id: string; phone: string; name: string; role: 'ADMIN' | 'RIDER'; isActive: boolean }
  interface Doctor { id: string; bmdcNo: string; specialty: string; channels: string[]; user: { name: string; phone: string; isActive: boolean } }
  interface Ledger { earnedPoisha: number; codCollectedPoisha: number; settledPoisha: number; cashHeldPoisha: number }

  let staff = $state<Staff[]>([]);
  let doctors = $state<Doctor[]>([]);
  let error = $state('');
  let busy = $state(false);
  let sheet = $state<'staff' | 'doctor' | 'ledger' | null>(null);
  let open = $state(false);
  let staffForm = $state<{ name: string; phone: string; role: 'RIDER' | 'ADMIN' }>({ name: '', phone: '', role: 'RIDER' });
  const blankDoctor = { name: '', phone: '', bmdcNo: '', specialty: '', bio: '', fee: '', meet: true, meetLink: '', whatsappOn: false, whatsapp: '' };
  let doctorForm = $state({ ...blankDoctor });
  let rider = $state<Staff | null>(null);
  let ledger = $state<Ledger | null>(null);
  let settle = $state('');

  async function load() {
    try {
      [staff, doctors] = await Promise.all([api.get<Staff[]>('/admin/staff'), api.get<Doctor[]>('/admin/doctors')]);
    } catch (err) { error = message(err); }
  }
  onMount(load);

  function show(kind: typeof sheet) { sheet = kind; error = ''; open = true; }

  async function addStaff(e: Event) {
    e.preventDefault();
    busy = true; error = '';
    try {
      await api.post('/admin/staff', staffForm);
      staffForm = { name: '', phone: '', role: 'RIDER' };
      open = false;
      await load();
    } catch (err) { error = message(err); } finally { busy = false; }
  }
  async function addDoctor(e: Event) {
    e.preventDefault();
    const f = doctorForm;
    const feePoisha = f.fee.trim() ? tkToPoisha(f.fee) : undefined;
    if (feePoisha === null) { error = 'Enter a valid fee, or leave it empty for the standard fee.'; return; }
    const channels = [...(f.meet ? ['GOOGLE_MEET'] : []), ...(f.whatsappOn ? ['WHATSAPP'] : [])];
    if (!channels.length) { error = 'Choose at least one call type.'; return; }
    busy = true; error = '';
    try {
      await api.post('/admin/doctors', {
        name: f.name, phone: f.phone, bmdcNo: f.bmdcNo, specialty: f.specialty, bio: f.bio, channels,
        ...(feePoisha !== undefined ? { feePoisha } : {}),
        ...(f.meet ? { meetLink: f.meetLink } : {}),
        ...(f.whatsappOn ? { whatsapp: f.whatsapp } : {}),
      });
      doctorForm = { ...blankDoctor };
      open = false;
      await load();
    } catch (err) { error = message(err); } finally { busy = false; }
  }
  async function toggle(s: Staff) {
    if (s.isActive && !confirm(`Disable ${s.name}? They will be signed out.`)) return;
    error = '';
    try { await api.patch(`/admin/staff/${s.id}/active`, { isActive: !s.isActive }); await load(); } catch (err) { error = message(err); }
  }
  async function openLedger(s: Staff) {
    rider = s; ledger = null; settle = '';
    show('ledger');
    try { ledger = await api.get<Ledger>(`/admin/riders/${s.id}/ledger`); } catch (err) { error = message(err); }
  }
  async function doSettle(e: Event) {
    e.preventDefault();
    const amountPoisha = tkToPoisha(settle);
    if (!amountPoisha) { error = 'Enter the amount received.'; return; }
    busy = true; error = '';
    try {
      await api.post(`/admin/riders/${rider!.id}/settle`, { amountPoisha });
      settle = '';
      ledger = await api.get<Ledger>(`/admin/riders/${rider!.id}/ledger`);
    } catch (err) { error = message(err); } finally { busy = false; }
  }
</script>

<div class="page">
  <h1 class="title">People</h1>
  <div class="row wrap actions">
    <button class="btn primary small" onclick={() => show('staff')}>Add staff</button>
    <button class="btn small" onclick={() => show('doctor')}>Onboard doctor</button>
  </div>
  {#if error && !open}<p class="error" role="alert">{error}</p>{/if}

  <h2 class="section">Staff</h2>
  <div class="group">
    {#each staff as s (s.id)}
      <div>
        <span class="grow"><strong>{s.name}</strong> <span class="chip">{s.role === 'RIDER' ? 'Delivery' : 'Admin'}</span>
          <span class="muted small line mono">{s.phone}</span></span>
        {#if s.role === 'RIDER'}<button class="btn small" onclick={() => openLedger(s)}>Cash</button>{/if}
        <button class="btn small" class:danger={s.isActive} onclick={() => toggle(s)}>{s.isActive ? 'Disable' : 'Enable'}</button>
      </div>
    {/each}
  </div>

  <h2 class="section">Doctors</h2>
  {#if doctors.length === 0}<p class="empty">No doctors yet</p>{/if}
  <div class="group">
    {#each doctors as d (d.id)}
      <div><span class="grow"><strong>{d.user.name}</strong>
        <span class="muted small line">{d.specialty} · BMDC <span class="mono">{d.bmdcNo}</span> · <span class="mono">{d.user.phone}</span></span></span></div>
    {/each}
  </div>
</div>

<Sheet bind:open title={sheet === 'staff' ? 'Add staff' : sheet === 'doctor' ? 'Onboard doctor' : (rider?.name ?? 'Cash')}>
  {#if sheet === 'staff'}
    <form class="stack" onsubmit={addStaff}>
      <Segmented label="Role" bind:value={staffForm.role} options={[{ value: 'RIDER', label: 'Delivery' }, { value: 'ADMIN', label: 'Admin' }]} />
      <label class="field"><span>Name</span><input class="input" bind:value={staffForm.name} required maxlength="80" /></label>
      <label class="field"><span>Mobile number</span><input class="input" type="tel" bind:value={staffForm.phone} required /></label>
      <button class="btn primary" disabled={busy}>Add</button>
    </form>
  {:else if sheet === 'doctor'}
    <form class="stack" onsubmit={addDoctor}>
      <label class="field"><span>Name</span><input class="input" bind:value={doctorForm.name} required maxlength="80" /></label>
      <label class="field"><span>Mobile number</span><input class="input" type="tel" bind:value={doctorForm.phone} required /></label>
      <label class="field"><span>BMDC number</span><input class="input" bind:value={doctorForm.bmdcNo} required maxlength="30" /></label>
      <label class="field"><span>Specialty</span><input class="input" bind:value={doctorForm.specialty} required maxlength="80" /></label>
      <label class="field"><span>About</span><textarea class="input" bind:value={doctorForm.bio} maxlength="1000"></textarea></label>
      <label class="field"><span>Fee in tk (empty uses the standard fee)</span><input class="input mono" bind:value={doctorForm.fee} inputmode="decimal" /></label>
      <label class="row"><input type="checkbox" bind:checked={doctorForm.meet} /> Google Meet</label>
      {#if doctorForm.meet}<label class="field"><span>Meet link</span><input class="input" type="url" bind:value={doctorForm.meetLink} placeholder="https://meet.google.com/…" required /></label>{/if}
      <label class="row"><input type="checkbox" bind:checked={doctorForm.whatsappOn} /> WhatsApp</label>
      {#if doctorForm.whatsappOn}<label class="field"><span>WhatsApp number</span><input class="input" type="tel" bind:value={doctorForm.whatsapp} required /></label>{/if}
      <button class="btn primary" disabled={busy}>Onboard</button>
    </form>
  {:else if sheet === 'ledger'}
    {#if ledger}
      <div class="stack">
        <div class="group small">
          <div class="row between"><span>Cash held</span><strong class="mono">{formatTk(ledger.cashHeldPoisha)}</strong></div>
          <div class="row between"><span>Cash collected</span><span class="mono">{formatTk(ledger.codCollectedPoisha)}</span></div>
          <div class="row between"><span>Handed over</span><span class="mono">{formatTk(ledger.settledPoisha)}</span></div>
          <div class="row between"><span>Earned</span><span class="mono">{formatTk(ledger.earnedPoisha)}</span></div>
        </div>
        <form class="stack" onsubmit={doSettle}>
          <label class="field"><span>Cash received (tk)</span><input class="input mono" bind:value={settle} inputmode="decimal" required /></label>
          <button class="btn primary" disabled={busy}>Record handover</button>
        </form>
      </div>
    {/if}
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Sheet>

<style>
  .actions { margin-bottom: 8px; }
  .line { display: block; }
  .between { justify-content: space-between; }
</style>
