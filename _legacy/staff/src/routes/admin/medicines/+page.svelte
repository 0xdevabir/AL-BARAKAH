<script lang="ts">
  import { formatTk } from '@albarakah/domain';
  import { Sheet } from '@albarakah/ui';
  import { onMount } from 'svelte';
  import { api, message, poishaToTk, tkToPoisha } from '#lib/app.ts';

  interface Batch { id: string; batchNo: string; expiresAt: string; qtyRemaining: number }
  interface Med { id: string; name: string; genericName: string; manufacturer: string; form: string; strength: string; packSize: string; pricePoisha: number; isRx: boolean; isActive: boolean; categoryId: string; description: string; imageUrl?: string; batches: Batch[] }
  interface Category { id: string; name: string }

  const blank = { name: '', genericName: '', manufacturer: '', form: 'Tablet', strength: '', packSize: '', price: '', isRx: false, isActive: true, categoryId: '', description: '' };

  let meds = $state<Med[]>([]);
  let categories = $state<Category[]>([]);
  let q = $state('');
  let editing = $state<Med | null>(null);
  let open = $state(false);
  let form = $state({ ...blank });
  let batch = $state({ batchNo: '', expiresAt: '', qty: '' });
  let error = $state('');
  let busy = $state(false);

  const stock = (m: Med) => m.batches.reduce((n, b) => n + b.qtyRemaining, 0);

  async function load() {
    try { meds = await api.get<Med[]>(`/admin/medicines?q=${encodeURIComponent(q.trim())}`); } catch (err) { error = message(err); }
  }
  // The API returns at most 100 rows, so searching has to happen on the server.
  let searchTimer: ReturnType<typeof setTimeout>;
  function search() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(load, 250);
  }
  onMount(async () => {
    await load();
    try { categories = await api.get<Category[]>('/categories'); } catch (err) { error = message(err); }
  });

  function edit(m: Med | null) {
    editing = m;
    error = '';
    batch = { batchNo: '', expiresAt: '', qty: '' };
    form = m
      ? { name: m.name, genericName: m.genericName, manufacturer: m.manufacturer, form: m.form, strength: m.strength, packSize: m.packSize, price: poishaToTk(m.pricePoisha), isRx: m.isRx, isActive: m.isActive, categoryId: m.categoryId, description: m.description }
      : { ...blank, categoryId: categories[0]?.id ?? '' };
    open = true;
  }
  async function save(e: Event) {
    e.preventDefault();
    const pricePoisha = tkToPoisha(form.price);
    if (pricePoisha === null) { error = 'Enter a valid price, such as 120 or 120.50.'; return; }
    const { price: _price, ...rest } = form;
    busy = true;
    error = '';
    try {
      const body = { ...rest, pricePoisha };
      if (editing) await api.patch(`/admin/medicines/${editing.id}`, body);
      else await api.post('/admin/medicines', body);
      open = false;
      await load();
    } catch (err) { error = message(err); } finally { busy = false; }
  }
  async function addBatch(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await api.post(`/admin/medicines/${editing!.id}/batches`, { batchNo: batch.batchNo, expiresAt: batch.expiresAt, qty: Number(batch.qty) });
      batch = { batchNo: '', expiresAt: '', qty: '' };
      await load();
      editing = meds.find((m) => m.id === editing!.id) ?? null;
    } catch (err) { error = message(err); } finally { busy = false; }
  }
</script>

<div class="page">
  <div class="row between"><h1 class="title">Medicines</h1><button class="btn primary small" onclick={() => edit(null)}>Add medicine</button></div>
  <input class="input find" type="search" bind:value={q} oninput={search} placeholder="Search brand or generic name" aria-label="Search medicines" />
  {#if error && !open}<p class="error" role="alert">{error}</p>{/if}
  <div class="group">
    {#each meds as m (m.id)}
      <button onclick={() => edit(m)}>
        {#if m.imageUrl}<img class="photo" src={m.imageUrl} alt="" width="40" height="40" referrerpolicy="no-referrer" />{/if}
        <span class="grow"><strong>{m.name} {m.strength}</strong>
          <span class="muted small line">{m.genericName} · <span class="mono">{formatTk(m.pricePoisha)}</span></span>
        </span>
        {#if !m.isActive}<span class="chip off">Hidden</span>{/if}
        <span class="chip" class:warn={stock(m) === 0}>{stock(m)} in stock</span>
      </button>
    {/each}
  </div>
</div>

<Sheet bind:open title={editing ? editing.name : 'Add medicine'}>
  <form class="stack" onsubmit={save}>
    <label class="field"><span>Brand name</span><input class="input" bind:value={form.name} required maxlength="160" /></label>
    <label class="field"><span>Generic name</span><input class="input" bind:value={form.genericName} required maxlength="200" /></label>
    <label class="field"><span>Manufacturer</span><input class="input" bind:value={form.manufacturer} maxlength="160" /></label>
    <div class="two">
      <label class="field"><span>Form</span><input class="input" bind:value={form.form} required maxlength="60" /></label>
      <label class="field"><span>Strength</span><input class="input" bind:value={form.strength} maxlength="80" /></label>
      <label class="field"><span>Pack</span><input class="input" bind:value={form.packSize} maxlength="80" /></label>
      <label class="field"><span>Price (tk)</span><input class="input mono" bind:value={form.price} inputmode="decimal" required /></label>
    </div>
    <label class="field"><span>Category</span>
      <select class="input" bind:value={form.categoryId} required>{#each categories as c (c.id)}<option value={c.id}>{c.name}</option>{/each}</select>
    </label>
    <label class="field"><span>Description</span><textarea class="input" bind:value={form.description} maxlength="2000"></textarea></label>
    <label class="row"><input type="checkbox" bind:checked={form.isRx} /> Prescription medicine</label>
    <label class="row"><input type="checkbox" bind:checked={form.isActive} /> Show in store</label>
    <button class="btn primary" disabled={busy}>Save</button>
  </form>

  {#if editing}
    <h3 class="section">Stock batches</h3>
    <div class="group small">
      {#each editing.batches as b (b.id)}
        <div class="row between"><span class="mono">{b.batchNo}</span><span>expires {b.expiresAt.slice(0, 10)}</span><span>{b.qtyRemaining}</span></div>
      {/each}
    </div>
    <form class="stack add" onsubmit={addBatch}>
      <div class="two">
        <label class="field"><span>Batch number</span><input class="input" bind:value={batch.batchNo} required maxlength="40" /></label>
        <label class="field"><span>Quantity</span><input class="input" type="number" min="1" bind:value={batch.qty} required /></label>
      </div>
      <label class="field"><span>Expiry date</span><input class="input" type="date" bind:value={batch.expiresAt} required /></label>
      <button class="btn" disabled={busy}>Add stock</button>
    </form>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
</Sheet>

<style>
  .between { justify-content: space-between; }
  .find { margin-bottom: 16px; }
  .line { display: block; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .add { margin-top: 12px; }
  .photo { flex: none; width: 40px; height: 40px; border-radius: 10px; object-fit: cover; background: var(--sage-soft); }
</style>
