<script lang="ts">
  import type { Snippet } from 'svelte';
  import Portal from '#lib/Portal.svelte';

  let { children }: { children: Snippet } = $props();
  const tabs = [{ href: '/delivery', label: 'Jobs' }, { href: '/delivery/earnings', label: 'Earnings' }];
</script>

<Portal role="RIDER" {tabs}>{@render children()}</Portal>
