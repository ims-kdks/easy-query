<script lang="ts">
import Icon from "./Icon.svelte";
import Modal from "./Modal.svelte";

interface Props {
  totalRows: number;
  queryTime: number | null;
  error: string | null;
  isLoading?: boolean;
  isWebMCPReady?: boolean;
}

let {
  totalRows,
  queryTime,
  error,
  isLoading = false,
  isWebMCPReady = false,
}: Props = $props();
let showErrorDialog = $state(false);
let showWhyDialog = $state(false);
const appVersion = __APP_VERSION__;

function formatTime(ms: number): string {
  if (ms < 1) {
    return "<1ms";
  }
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

function handleErrorClick() {
  if (error) {
    showErrorDialog = true;
  }
}

function closeDialog() {
  showErrorDialog = false;
}

function closeWhyDialog() {
  showWhyDialog = false;
}
</script>

<footer class="flex-none h-7 bg-slate-900 border-t border-slate-700 px-4 flex items-center justify-between text-xs">
  <div class="flex items-center gap-4">
    <!-- Status indicator -->
    <div class="flex items-center gap-2">
      {#if isLoading}
        <span class="flex items-center gap-1.5 text-amber-400">
          <Icon name="spinner" class="w-3.5 h-3.5 animate-spin" />
          <span>Processing...</span>
        </span>
      {:else if error}
        <button
          type="button"
          class="flex items-center gap-1.5 text-red-400 hover:text-red-300 focus:outline-none"
          onclick={handleErrorClick}
          aria-label="Show error details"
        >
          <Icon name="alert-circle" class="w-3.5 h-3.5" />
          <span class="truncate max-w-md" title={error}>Error: {error}</span>
        </button>
      {:else}
        <span class="flex items-center gap-1.5 text-emerald-500">
          <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
          <span>Ready</span>
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1.5 text-slate-400 border-l border-slate-700 pl-4">
      <span>{totalRows.toLocaleString()} {totalRows === 1 ? "row" : "rows"}</span>
    </div>

    <!-- Query time -->
    {#if queryTime !== null && !isLoading}
      <div class="flex items-center gap-1.5 text-slate-400 border-l border-slate-700 pl-4">
        <Icon name="clock" class="w-3.5 h-3.5" />
        <span>{formatTime(queryTime)}</span>
      </div>
    {/if}
  </div>

  <div class="flex items-center gap-3 text-slate-500">
    {#if isWebMCPReady}
      <span class="text-emerald-500">WebMCP ready</span>
    {/if}
    <!-- Version/info -->
    <span class="text-slate-600">v{appVersion}</span>
    <button
      type="button"
      class="text-slate-500 hover:text-emerald-400 transition-colors"
      onclick={() => (showWhyDialog = true)}
    >
      • Why I built this?
    </button>
  </div>
</footer>

<Modal open={showErrorDialog && Boolean(error)} title="Error details" onclose={closeDialog} size="md">
  <div class="flex items-center gap-2 text-sm font-semibold text-red-400 mb-2">
    <Icon name="alert-circle" class="w-4 h-4" />
    <span>Error</span>
  </div>
  <pre class="whitespace-pre-wrap text-sm text-slate-200 bg-slate-800/70 border border-slate-700 rounded p-3 overflow-auto max-h-60">{error}</pre>
  {#snippet footer()}
    <button
      type="button"
      class="px-3 py-1.5 text-sm rounded bg-slate-700 text-slate-200 hover:bg-slate-600 focus:outline-none"
      onclick={closeDialog}
    >
      Close
    </button>
  {/snippet}
</Modal>

<Modal open={showWhyDialog} title="Why I built this?" onclose={closeWhyDialog} size="md">
  <div class="space-y-2 text-xs text-slate-400">
    <p>Hi!</p>
    <p>There are plenty of CSV/Parquet/JSON/JSONL viewers out there, but I kept running into small frustrations that added up. After bouncing between Excel, Numbers, VS Code, and a bunch of web tools, I realized none of them quite fit how I actually work. So I decided to build one myself using <a class="text-slate-300 hover:text-emerald-400 transition-colors" href="https://duckdb.org/docs/stable/clients/wasm/overview">DuckDB-Wasm</a> + <a class="text-slate-300 hover:text-emerald-400 transition-colors" href="https://svelte.dev">Svelte</a>.</p>

    <p>I built this mainly for my own workflow. A few things I really wanted:</p>

    <span class="text-emerald-500">1. SQL-first exploration + export.</span><br>
    <p>When I'm working with multiple CSVs or messy schemas, clicking around only gets me so far. Being able to write SQL (or programmatic queries) is the fastest way for me to understand the data, and I want to export query results easily.</p>

    <span class="text-emerald-500">2. High performance on large files.</span><br>
    <p>I love the <a class="text-slate-300 hover:text-emerald-400 transition-colors" href="https://marketplace.visualstudio.com/items?itemName=mechatroner.rainbow-csv">Rainbow CSV plugin</a> in VS Code, but once files hit GB scale, my laptop starts to struggle. Apple Numbers can take minutes just to open a file, and it doesn't support SQL at all. I wanted something that stays responsive even for large datasets.</p>

    <span class="text-emerald-500">3. A proper GUI for quick inspection.</span><br>
    <p>Sometimes I don't want to write SQL, I just want to sort, filter, and search with a few clicks.</p>

    <span class="text-emerald-500">4. Infinite scrolling.</span><br>
    <p>This is surprisingly rare. Most web CSV tools paginate results, which constantly breaks my flow. I really wanted to just scroll through the data naturally.</p>

    <p>This is still early and very much a work in progress, but it already covers the core things I personally needed. I'd love to hear any feedback, especially if you work with large CSV/Parquet/JSON/JSONL files or have strong opinions on data tooling.</p>

    <p>Thanks for checking it out!</p>
  </div>
  {#snippet footer()}
    <button
      type="button"
      class="px-3 py-1.5 text-sm rounded bg-emerald-500 text-slate-900 hover:bg-emerald-400 focus:outline-none"
      onclick={closeWhyDialog}
    >
      Got it
    </button>
  {/snippet}
</Modal>
