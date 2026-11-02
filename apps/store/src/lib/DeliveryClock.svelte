<script lang="ts">
  import { fmtTime, fmtWindow } from '@albarakah/ui';
  import { getLocale } from '#lib/paraglide/runtime.js';

  interface Slot { start: string; end: string }
  let { slots, value = $bindable(''), paused = false }: { slots: Slot[]; value: string; paused?: boolean } = $props();

  const DHAKA = 6 * 3_600_000;
  const DAY = 86_400_000;
  const dayId = (iso: string) => Math.floor((new Date(iso).getTime() + DHAKA) / DAY);
  const hourOf = (iso: string) => Math.floor(((new Date(iso).getTime() + DHAKA) % DAY) / 3_600_000);

  const dayFmt = $derived(new Intl.DateTimeFormat(getLocale() === 'bn' ? 'bn-BD' : 'en-GB', {
    timeZone: 'Asia/Dhaka', weekday: 'short', day: 'numeric', month: 'short',
  }));

  const days = $derived.by(() => {
    const map = new Map<number, Slot[]>();
    for (const slot of slots) {
      const id = dayId(slot.start);
      map.set(id, [...(map.get(id) ?? []), slot]);
    }
    return [...map.entries()].map(([id, items]) => ({ id, items, label: dayFmt.format(new Date(items[0].start)) }));
  });

  let dayPick = $state<number | null>(null);
  const active = $derived(days.find((d) => d.id === (dayPick ?? (value ? dayId(value) : days[0]?.id))) ?? days[0]);

  function twin(slot: Slot, items: Slot[]) {
    const h = hourOf(slot.start);
    return items.some((other) => {
      const o = hourOf(other.start);
      return o % 12 === h % 12 && (o < 12) !== (h < 12);
    });
  }

  function mark(slot: Slot, items: Slot[]) {
    const h = hourOf(slot.start);
    const numeral = h % 12;
    const r = twin(slot, items) ? (h < 12 ? 28 : 42) : 40;
    return { h, numeral, r, label: numeral === 0 ? 12 : numeral };
  }

  const chosen = $derived(active?.items.find((s) => s.start === value) ?? active?.items[0]);
  const hand = $derived(chosen && active ? mark(chosen, active.items) : null);

  $effect(() => {
    if (slots.length && !slots.some((s) => s.start === value)) value = slots[0].start;
  });

  function chooseDay(id: number) {
    dayPick = id;
    const items = days.find((d) => d.id === id)?.items ?? [];
    if (!items.some((s) => s.start === value)) value = items[0]?.start ?? value;
  }

  let face = $state<HTMLElement>();
  let dragging = false;

  function nearest(clientX: number, clientY: number) {
    if (!face || !active || paused) return;
    const rect = face.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    let best = active.items[0];
    let bestD = Infinity;
    for (const slot of active.items) {
      const spot = mark(slot, active.items);
      const angle = (spot.numeral / 12) * Math.PI * 2 - Math.PI / 2;
      const sx = 50 + Math.cos(angle) * spot.r;
      const sy = 50 + Math.sin(angle) * spot.r;
      const d = (sx - x) ** 2 + (sy - y) ** 2;
      if (d < bestD) { bestD = d; best = slot; }
    }
    value = best.start;
  }

  function down(e: PointerEvent) {
    if (paused) return;
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    nearest(e.clientX, e.clientY);
  }

  function nudge(dir: number) {
    if (!active || paused) return;
    const i = Math.max(0, active.items.findIndex((s) => s.start === value));
    value = active.items[(i + dir + active.items.length) % active.items.length].start;
  }
</script>

<div class="clock" class:paused>
  <div class="days" role="tablist">
    {#each days as day (day.id)}
      <button type="button" role="tab" aria-selected={active?.id === day.id} onclick={() => chooseDay(day.id)}>{day.label}</button>
    {/each}
  </div>

  {#if active && hand && chosen}
    <div
      class="face"
      bind:this={face}
      role="radiogroup"
      tabindex="0"
      onpointerdown={down}
      onpointermove={(e) => dragging && nearest(e.clientX, e.clientY)}
      onpointerup={() => (dragging = false)}
      onpointercancel={() => (dragging = false)}
      onkeydown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { nudge(1); e.preventDefault(); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { nudge(-1); e.preventDefault(); }
      }}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle class="dial" cx="50" cy="50" r="48" />
        {#each { length: 60 } as _, i (i)}
          <line class="tick" class:major={i % 5 === 0} x1="50" y1="5.5" x2="50" y2={i % 5 === 0 ? 10 : 8} transform="rotate({i * 6} 50 50)" />
        {/each}
        <g class="hand" style:transform="rotate({hand.numeral * 30}deg)">
          <line x1="50" y1="52" x2="50" y2={50 - hand.r + 6} />
        </g>
        <circle class="pin" cx="50" cy="50" r="2.2" />
      </svg>
      {#each active.items as slot (slot.start)}
        {@const spot = mark(slot, active.items)}
        <button
          type="button"
          role="radio"
          aria-checked={value === slot.start}
          aria-label={fmtWindow(slot.start, slot.end)}
          style:left="{(50 + Math.cos((spot.numeral / 12) * Math.PI * 2 - Math.PI / 2) * spot.r)}%"
          style:top="{(50 + Math.sin((spot.numeral / 12) * Math.PI * 2 - Math.PI / 2) * spot.r)}%"
          onclick={() => (value = slot.start)}
        >{spot.label}</button>
      {/each}
    </div>
    <p class="when">
      <strong>{fmtTime(chosen.start)}</strong>
      <span>– {fmtTime(chosen.end)}</span>
    </p>
  {/if}
</div>

<style>
  .clock { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .paused { opacity: 0.4; pointer-events: none; }
  .days { display: flex; gap: 8px; width: 100%; }
  .days button { flex: 1; min-height: 48px; border: 0; border-radius: 14px; background: var(--raised); color: var(--ink); font: inherit; font-weight: 600; cursor: pointer; }
  .days button[aria-selected='true'] { background: var(--accent); color: var(--on-accent); }
  .face { position: relative; width: min(100%, 320px); aspect-ratio: 1; touch-action: none; border-radius: 50%; cursor: grab; }
  .face:active { cursor: grabbing; }
  svg { width: 100%; height: 100%; }
  .dial { fill: var(--raised); stroke: #2b3d2a; stroke-width: 1.2; }
  .tick { stroke: #2b3d2a; stroke-width: 0.6; stroke-linecap: round; opacity: 0.35; }
  .tick.major { stroke-width: 1.1; opacity: 0.7; }
  .hand { transform-origin: 50px 50px; transition: transform 0.18s var(--ease); }
  .hand line { stroke: #2b3d2a; stroke-width: 1.5; stroke-linecap: round; }
  .pin { fill: #2b3d2a; }
  .face button { position: absolute; width: 36px; height: 36px; margin: -18px 0 0 -18px; border: 0; border-radius: 50%; background: transparent; color: var(--ink); font: inherit; font-weight: 650; font-size: 0.95rem; cursor: pointer; }
  .face button[aria-checked='true'] { background: #2b3d2a; color: #fbfbfa; }
  .when { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 1.35rem; }
  .when span { color: var(--muted); font-size: 1rem; }
  @media (prefers-reduced-motion: reduce) { .hand { transition: none; } }
</style>
