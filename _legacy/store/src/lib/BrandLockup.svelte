<script lang="ts">
  import Mark from './Mark.svelte';

  let { size = 28 }: { size?: number } = $props();
</script>

<span class="lockup">
  <Mark {size} />
  <span>BarakaBari</span>
</span>

<style>
  .lockup { display: inline-flex; align-items: center; gap: 9px; color: var(--accent-ink); font-weight: 700; letter-spacing: -0.02em; line-height: 1; }
  .lockup :global(svg) { flex: none; color: var(--accent); }
</style>
