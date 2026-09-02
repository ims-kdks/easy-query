<script lang="ts">
import { injectAnalytics } from "@vercel/analytics/sveltekit";
import { browser } from "$app/environment";
import "../app.css";

let { children } = $props();

if (browser) {
  injectAnalytics();
}
</script>

{@render children()}
