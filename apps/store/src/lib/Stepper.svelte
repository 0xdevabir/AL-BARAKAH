<script lang="ts">
  let { qty, label, onchange }: { qty: number; label: string; onchange: (qty: number) => void } = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
  <button aria-label="−" onclick={() => onchange(qty - 1)}>−</button>
  <output class="mono">{qty}</output>
  <button aria-label="+" disabled={qty >= 50} onclick={() => onchange(qty + 1)}>+</button>
</div>

<style>
  .stepper { display: flex; align-items: center; flex: none; border-radius: 11px; background: var(--surface); }
  button { width: 38px; height: 38px; border: 0; background: none; color: var(--ink); font-size: 1.2rem; cursor: pointer; touch-action: manipulation; }
  output { min-width: 20px; text-align: center; font-size: 0.9rem; }
</style>
