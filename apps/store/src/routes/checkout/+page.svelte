<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { fmtWindow, Segmented, Sheet } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { api, cart, openPayment } from '#lib/app.svelte.ts';
  import { m } from '#lib/paraglide/messages.js';

  interface Zone { id: string; name: string; deliveryFeePoisha: number }
  interface Address { id: string; label: string; line: string; phone: string; zone: Zone }
  interface Slot { start: string; end: string }

  let step = $state(0);
  let addresses = $state<Address[]>([]);
  let zones = $state<Zone[]>([]);
  let slots = $state<Slot[]>([]);
  let emergency = $state({ available: false, feePoisha: 0, minutes: 60 });
  let addressId = $state('');
  let type = $state<'NORMAL' | 'EMERGENCY'>('NORMAL');
  let slotStart = $state('');
  let paymentMethod = $state<'COD' | 'BKASH'>('COD');
  let notes = $state('');
  let prescriptionKey = $state<string>();
  let uploading = $state(false);
  let error = $state('');
  let busy = $state(false);
  let sheet = $state(false);
  let draft = $state({ label: '', line: '', zoneId: '', phone: '' });
  // Generated once, so tapping again after a dropped connection cannot create a second order.
  const idempotencyKey = crypto.randomUUID();

  const address = $derived(addresses.find((a) => a.id === addressId));
  const deliveryFee = $derived(address?.zone.deliveryFeePoisha ?? 0);
  const emergencyFee = $derived(type === 'EMERGENCY' ? emergency.feePoisha : 0);
  const total = $derived(cart.subtotal + deliveryFee + emergencyFee);
  const canNext = $derived(step === 0 ? !!addressId : type === 'EMERGENCY' ? emergency.available : !!slotStart);

  onMount(async () => {
    if (!api.ready) await api.restore();
    if (!api.user) { await goto('/login?next=/checkout', { replace: true }); return; }
    if (cart.lines.length === 0) { await goto('/cart', { replace: true }); return; }
    try {
      const [a, z, s] = await Promise.all([
        api.get<Address[]>('/addresses'),
        api.get<Zone[]>('/zones'),
        api.get<{ slots: Slot[]; emergency: typeof emergency }>('/delivery-slots'),
      ]);
      addresses = a; zones = z; slots = s.slots; emergency = s.emergency;
      addressId = a[0]?.id ?? '';
      slotStart = s.slots[0]?.start ?? '';
      draft.phone = api.user.phone.replace('+88', '');
      draft.zoneId = z[0]?.id ?? '';
    } catch (err) { error = (err as Error).message; }
  });

  async function saveAddress(e: Event) {
    e.preventDefault();
    error = '';
    try {
      const a = await api.post<Address>('/addresses', draft);
      addresses = [a, ...addresses];
      addressId = a.id;
      sheet = false;
    } catch (err) { error = (err as Error).message; }
  }

  async function upload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    error = '';
    if (file.size > 8 * 1024 * 1024) { error = 'Please choose a file under 8 MB.'; return; }
    uploading = true;
    try {
      const { key, url } = await api.post<{ key: string; url: string }>('/prescriptions/upload-url', { contentType: file.type });
      const put = await fetch(url, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!put.ok) throw new Error('The upload failed. Please try again.');
      prescriptionKey = key;
    } catch (err) { error = (err as Error).message; } finally { uploading = false; }
  }

  async function place() {
    busy = true;
    error = '';
    try {
      const order = await api.post<{ id: string }>('/orders', {
        idempotencyKey, addressId, type, paymentMethod,
        ...(type === 'NORMAL' ? { slotStart } : {}),
        ...(prescriptionKey ? { prescriptionKey } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        items: cart.lines.map((l) => ({ medicineId: l.id, qty: l.qty })),
      });
      cart.clear();
      if (paymentMethod === 'BKASH') {
        const { redirectUrl } = await api.post<{ redirectUrl: string }>('/payments/start', { purpose: 'ORDER', refId: order.id });
        await openPayment(redirectUrl);
      } else {
        await goto(`/orders/${order.id}?placed=1`, { replace: true });
      }
    } catch (err) { error = (err as Error).message; } finally { busy = false; }
  }
</script>
<svelte:head><title>{m.checkout()} · AL-BARAKAH</title></svelte:head>

<div class="page stack">
  <div class="row">
    <button class="btn ghost small back" onclick={() => (step === 0 ? history.back() : step--)}>‹ {m.back()}</button>
    <ol class="dots" aria-hidden="true">{#each [0, 1, 2] as i}<li class:on={i <= step}></li>{/each}</ol>
  </div>

  {#if step === 0}
    <h1 class="title">{m.step_address()}</h1>
    {#if addresses.length}
      <div class="group" role="radiogroup" aria-label={m.step_address()}>
        {#each addresses as a (a.id)}
          <button role="radio" aria-checked={addressId === a.id} onclick={() => (addressId = a.id)}>
            <span class="mark" class:on={addressId === a.id}></span>
            <span class="grow"><strong>{a.label}</strong><span class="muted small block">{a.line} · {a.zone.name}</span></span>
          </button>
        {/each}
      </div>
    {/if}
    <button class="btn block" onclick={() => (sheet = true)}>+ {m.add_address()}</button>
  {:else if step === 1}
    <h1 class="title">{m.step_time()}</h1>
    <Segmented label={m.step_time()} bind:value={type} options={[{ value: 'NORMAL', label: m.time_choose() }, { value: 'EMERGENCY', label: m.time_emergency() }]} />
    {#if type === 'EMERGENCY'}
      <div class="card stack">
        {#if emergency.available}
          <strong>{m.emergency_title()}</strong>
          <p class="muted">{m.emergency_body({ minutes: emergency.minutes, fee: formatTk(emergency.feePoisha) })}</p>
        {:else}
          <p>{m.emergency_closed()}</p>
        {/if}
      </div>
    {:else}
      <p class="muted small">{m.earliest_note()}</p>
      <div class="group" role="radiogroup" aria-label={m.time_choose()}>
        {#each slots as s (s.start)}
          <button role="radio" aria-checked={slotStart === s.start} onclick={() => (slotStart = s.start)}>
            <span class="grow">{fmtWindow(s.start, s.end)}</span>
            <span class="mark" class:on={slotStart === s.start}></span>
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    <h1 class="title">{m.step_pay()}</h1>
    <Segmented label={m.step_pay()} bind:value={paymentMethod} options={[{ value: 'COD', label: m.pay_cod() }, { value: 'BKASH', label: m.pay_bkash() }]} />
    <label class="field">
      <span>{m.prescription()}</span>
      {#if prescriptionKey}
        <span class="chip">{m.prescription_added()}</span>
      {:else}
        <input class="input file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" disabled={uploading} onchange={upload} aria-describedby="rx-hint" />
        <small id="rx-hint" class="muted">{m.prescription_add()}</small>
      {/if}
    </label>
    <label class="field"><span>{m.notes()}</span><textarea class="input" bind:value={notes} maxlength="300"></textarea></label>
    <div class="group">
      <div class="between"><span>{m.subtotal()}</span><span class="price">{formatTk(cart.subtotal)}</span></div>
      <div class="between"><span>{m.delivery_fee()}</span><span class="price">{formatTk(deliveryFee)}</span></div>
      {#if emergencyFee}<div class="between"><span>{m.emergency_fee()}</span><span class="price">{formatTk(emergencyFee)}</span></div>{/if}
      <div class="between"><strong>{m.total()}</strong><strong class="price">{formatTk(total)}</strong></div>
    </div>
  {/if}

  {#if error}<p class="error" role="alert">{error}</p>{/if}

  <div class="dock">
    {#if step < 2}
      <button class="btn primary block" disabled={!canNext} onclick={() => step++}>{m.next()}</button>
    {:else}
      <span class="grow"><span class="muted small">{m.total()}</span><strong class="mono sum">{formatTk(total)}</strong></span>
      <button class="btn primary" disabled={busy || uploading} onclick={place}>{paymentMethod === 'BKASH' ? m.pay_now() : m.place_order()}</button>
    {/if}
  </div>
</div>

<Sheet bind:open={sheet} title={m.add_address()}>
  <form class="stack" onsubmit={saveAddress}>
    <label class="field"><span>{m.address_label()}</span><input class="input" bind:value={draft.label} placeholder={m.address_label_hint()} required maxlength="40" /></label>
    <label class="field"><span>{m.address_line()}</span><textarea class="input" bind:value={draft.line} placeholder={m.address_line_hint()} required minlength="3" maxlength="200"></textarea></label>
    <label class="field"><span>{m.zone()}</span>
      <select class="input" bind:value={draft.zoneId} required>
        {#each zones as z (z.id)}<option value={z.id}>{z.name} ({formatTk(z.deliveryFeePoisha)})</option>{/each}
      </select>
    </label>
    <label class="field"><span>{m.contact_phone()}</span><input class="input" type="tel" bind:value={draft.phone} required /></label>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <button class="btn primary block">{m.save()}</button>
  </form>
</Sheet>

<style>
  .back { padding-left: 0; }
  .dots { display: flex; gap: 6px; margin: 0 0 0 auto; padding: 0; list-style: none; }
  .dots li { width: 22px; height: 4px; border-radius: 2px; background: var(--line); }
  .dots li.on { background: var(--accent); }
  .title { margin-bottom: 0; }
  .block { display: block; }
  .between { justify-content: space-between; }
  .mark { flex: none; width: 22px; height: 22px; border-radius: 50%; box-shadow: inset 0 0 0 1.5px var(--line); }
  .mark.on { background: var(--accent); box-shadow: none; }
  .sum { display: block; font-size: 1.45rem; font-weight: 700; }
  .file { padding-top: 11px; }
</style>
