<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { onMount } from 'svelte';
  import { api, message, poishaToTk, tkToPoisha } from '#lib/app.ts';

  interface Zone { id: string; name: string; deliveryFeePoisha: number; isActive: boolean }
  const MONEY = [['emergencyFeePoisha', 'Emergency fee'], ['riderPayoutPoisha', 'Rider pay per delivery'], ['riderEmergencyBonusPoisha', 'Rider emergency bonus'], ['doctorBookingFeePoisha', 'Doctor booking fee']] as const;
  const NUMBERS = [['leadHours', 'Minimum hours before delivery'], ['openHour', 'Opening hour (0-23)'], ['closeHour', 'Closing hour (1-24)'], ['slotHours', 'Window length in hours'], ['daysAhead', 'Days ahead customers can choose'], ['emergencyStartHour', 'Emergency starts (hour)'], ['emergencyEndHour', 'Emergency ends (hour)'], ['emergencyMinutes', 'Emergency promise in minutes'], ['androidLatestVersionCode', 'Android version code (0 = off)']] as const;

  let settings = $state<Record<string, number | boolean | string> | null>(null);
  let money = $state<Record<string, string>>({});
  let zones = $state<Zone[]>([]);
  let zone = $state({ name: '', fee: '' });
  let error = $state('');
  let saved = $state(false);
  let busy = $state(false);

  async function loadZones() { zones = await api.get<Zone[]>('/admin/zones'); }
  onMount(async () => {
    try {
      const s = await api.get<Record<string, number | boolean | string>>('/settings');
      settings = {
        ...s,
        androidLatestVersionName: String(s.androidLatestVersionName ?? ''),
        androidApkUrl: String(s.androidApkUrl ?? ''),
        androidUpdateNotes: String(s.androidUpdateNotes ?? ''),
        androidForceUpdate: !!s.androidForceUpdate,
      };
      money = Object.fromEntries(MONEY.map(([k]) => [k, poishaToTk(s[k] as number)]));
      await loadZones();
    } catch (err) { error = message(err); }
  });

  async function save(e: Event) {
    e.preventDefault();
    const body: Record<string, unknown> = { ...settings };
    for (const [k, label] of MONEY) {
      const v = tkToPoisha(money[k]);
      if (v === null) { error = `${label}: enter a valid amount.`; return; }
      body[k] = v;
    }
    for (const [k] of NUMBERS) body[k] = Number(body[k]);
    body.androidLatestVersionName = String(body.androidLatestVersionName ?? '');
    body.androidApkUrl = String(body.androidApkUrl ?? '');
    body.androidUpdateNotes = String(body.androidUpdateNotes ?? '');
    body.androidForceUpdate = !!body.androidForceUpdate;
    busy = true; error = ''; saved = false;
    try { await api.put('/settings', body); saved = true; } catch (err) { error = message(err); } finally { busy = false; }
  }
  async function addZone(e: Event) {
    e.preventDefault();
    const deliveryFeePoisha = tkToPoisha(zone.fee);
    if (deliveryFeePoisha === null) { error = 'Enter a valid delivery fee.'; return; }
    error = '';
    try { await api.post('/admin/zones', { name: zone.name, deliveryFeePoisha, isActive: true }); zone = { name: '', fee: '' }; await loadZones(); } catch (err) { error = message(err); }
  }
  async function toggleZone(z: Zone) {
    error = '';
    try { await api.patch(`/admin/zones/${z.id}`, { name: z.name, deliveryFeePoisha: z.deliveryFeePoisha, isActive: !z.isActive }); await loadZones(); } catch (err) { error = message(err); }
  }
</script>

<div class="page">
  <h1 class="title">Fees and zones</h1>
  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <h2 class="section">Delivery zones</h2>
  <div class="group">
    {#each zones as z (z.id)}
      <div>
        <span class="grow">{z.name} <span class="muted mono small">{formatTk(z.deliveryFeePoisha)}</span></span>
        <button class="btn small" onclick={() => toggleZone(z)}>{z.isActive ? 'Hide' : 'Show'}</button>
      </div>
    {/each}
  </div>
  <form class="row wrap add" onsubmit={addZone}>
    <input class="input grow" aria-label="Zone name" placeholder="Zone name" bind:value={zone.name} required maxlength="80" />
    <input class="input fee mono" aria-label="Delivery fee in taka" placeholder="Fee (tk)" bind:value={zone.fee} inputmode="decimal" required />
    <button class="btn">Add zone</button>
  </form>

  {#if settings}
    <h2 class="section">Fees and hours</h2>
    <form class="stack" onsubmit={save}>
      <div class="grid">
        {#each MONEY as [k, label] (k)}
          <label class="field"><span>{label} (tk)</span><input class="input mono" bind:value={money[k]} inputmode="decimal" required /></label>
        {/each}
        {#each NUMBERS as [k, label] (k)}
          <label class="field"><span>{label}</span><input class="input mono" type="number" bind:value={settings[k]} required /></label>
        {/each}
      </div>
      <label class="row"><input type="checkbox" bind:checked={settings.requireRxUpload as boolean} /> Require a prescription upload for prescription medicines</label>

      <h2 class="section">Android app updates</h2>
      <p class="muted small">Phones below this version code see an update sheet. Leave version code at 0 to turn checks off. Shipping an APK also writes this automatically.</p>
      <div class="grid">
        <label class="field"><span>Latest version name</span><input class="input mono" bind:value={settings.androidLatestVersionName as string} placeholder="1.2.0" maxlength="40" /></label>
        <label class="field"><span>APK download URL (optional)</span><input class="input" bind:value={settings.androidApkUrl as string} placeholder="Uses the store download link if empty" maxlength="500" /></label>
      </div>
      <label class="field"><span>Update notes</span><textarea class="input" bind:value={settings.androidUpdateNotes as string} rows="3" maxlength="500" placeholder="What is new in this build"></textarea></label>
      <label class="row"><input type="checkbox" bind:checked={settings.androidForceUpdate as boolean} /> Require update (no Later button)</label>

      <button class="btn primary" disabled={busy}>Save</button>
      {#if saved}<p role="status" class="small">Saved.</p>{/if}
    </form>
  {/if}
</div>

<style>
  .add { margin-top: 12px; }
  .add .grow { min-width: 160px; }
  .fee { width: 110px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
</style>
