<script lang="ts">
	import { badge } from '#lib/format.ts';

	let { meta }: { meta: { label: string; cls: string } } = $props();
</script>

<span class="{badge} {meta.cls}">{meta.label}</span>
