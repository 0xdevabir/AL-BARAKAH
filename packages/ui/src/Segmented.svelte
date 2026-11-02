<script lang="ts" generics="T extends string">
  let { value = $bindable(), options, label }: { value: T; options: { value: T; label: string }[]; label: string } = $props();
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={value === o.value} class:on={value === o.value} onclick={() => (value = o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface); }
  button { flex: 1; min-height: 40px; padding: 0 8px; border: 0; border-radius: 10px; background: none; color: var(--ink); font: inherit; font-weight: 500; cursor: pointer; transition: background-color 0.2s; }
  .on { background: var(--bg); box-shadow: 0 1px 3px rgb(0 0 0 / 0.12); }
</style>
