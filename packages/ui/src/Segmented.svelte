<script lang="ts" generics="T extends string">
  let { value = $bindable(), options, label }: { value: T; options: { value: T; label: string }[]; label: string } = $props();
</script>

<div class="seg" role="radiogroup" aria-label={label}>
  {#each options as o (o.value)}
    <button type="button" role="radio" aria-checked={value === o.value} class:on={value === o.value} onclick={() => (value = o.value)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: rgb(118 118 128 / 0.12); }
  button { flex: 1; min-height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: none; color: var(--ink); font: inherit; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: background-color 0.2s var(--ease), box-shadow 0.2s var(--ease); }
  .on { background: var(--raised); box-shadow: 0 1px 1px rgb(0 0 0 / 0.04), 0 3px 8px rgb(0 0 0 / 0.12); }
</style>

