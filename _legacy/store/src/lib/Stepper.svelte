<script lang="ts">
  let { qty, label, onchange }: { qty: number; label: string; onchange: (qty: number) => void } = $props();
</script>

<div class="stepper" role="group" aria-label={label}>
  <button aria-label="−" onclick={() => onchange(qty - 1)}>−</button>
  <output class="mono">{qty}</output>
  <button aria-label="+" disabled={qty >= 50} onclick={() => onchange(qty + 1)}>+</button>
</div>

<style>
  .stepper { display: flex; align-items: center; flex: none; border-radius: var(--r-sm); background: var(--surface); }
  button { width: 44px; height: 44px; border: 0; background: none; color: var(--ink); font-size: 1.25rem; cursor: pointer; touch-action: manipulation; }
  output { min-width: 22px; text-align: center; font-size: 1rem; font-weight: 700; }
</style>
