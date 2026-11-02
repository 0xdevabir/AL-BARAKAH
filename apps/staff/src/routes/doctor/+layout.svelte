<script lang="ts">
  import type { Snippet } from 'svelte';
  import Portal from '#lib/Portal.svelte';

  let { children }: { children: Snippet } = $props();
  const tabs = [{ href: '/doctor', label: 'Bookings' }, { href: '/doctor/availability', label: 'Availability' }];
</script>

<Portal role="DOCTOR" {tabs}>{@render children()}</Portal>
