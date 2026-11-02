<script lang="ts" generics="T extends string">
  let { value = $bindable(), options, label }: { value: T; options: { value: T; label: string }[]; label: string } = $props();
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={value === o.value} class:on={value === o.value} onclick={() => (value = o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { display: flex; gap: 4px; padding: 4px; border-radius: var(--r-sm); background: var(--surface); }
  button { flex: 1; min-height: 44px; padding: 0 10px; border: 0; border-radius: 12px; background: none; color: var(--ink); font: inherit; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s var(--ease), box-shadow 0.2s var(--ease); }
  .on { background: var(--raised); box-shadow: var(--shadow); }
</style>


