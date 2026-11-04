<script lang="ts">
  import { CROSS } from './mark.ts';

  let { size = 28 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
  <rect width="56" height="56" x="4" y="4" rx="16" fill="currentColor" />
  <path d={CROSS} fill="#fff" />
</svg>
