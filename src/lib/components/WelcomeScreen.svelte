<script lang="ts">
import FileUpload from "./FileUpload.svelte";
import Icon from "./Icon.svelte";

interface Props {
  brand: string;
  pendingRestoreCount: number;
  isRestoring: boolean;
  onrestorependingfiles?: () => void | Promise<void>;
  onfileselectmultiple?: (files: File[]) => void | Promise<void>;
}

let {
  brand,
  pendingRestoreCount,
  isRestoring,
  onrestorependingfiles,
  onfileselectmultiple,
}: Props = $props();
</script>

<div class="flex-1 overflow-y-auto">
  <div class="min-h-full flex items-center justify-center p-8">
    <div class="w-full max-w-6xl grid gap-10 lg:grid-cols-2 lg:items-stretch">
      <div class="space-y-6">
        <div class="flex items-center gap-4">
          <img src="/favicon.png" alt={brand} class="w-12 h-12 rounded-xl" />
          <h2 class="text-2xl font-semibold text-slate-100">
            High-Performance Data Viewer with SQL Support
          </h2>
        </div>

        <p class="text-slate-400 leading-relaxed">
          Load CSV/TSV/Parquet/JSON/JSONL and run cross-table SQL in your browser - powered by
          <span class="text-emerald-500"><a href="https://svelte.dev">Svelte</a></span>
          +
          <span class="text-emerald-500"
            ><a href="https://duckdb.org/docs/stable/clients/wasm/overview">DuckDB-Wasm</a></span
          >.
        </p>

        <ul class="list-disc list-inside text-slate-400 text-sm space-y-1.5">
          <li>Free to use, in-browser only, <span class="text-emerald-500">no data uploads</span></li>
          <li>CSV, TSV, Parquet, JSON, and JSONL file support</li>
          <li>
            <span class="text-emerald-500">Full SQL</span> with
            <span class="text-emerald-500">cross-table joins</span> via DuckDB-Wasm
          </li>
          <li>
            High-performance virtual scrolling for millions of rows, no paging
            (<span class="text-emerald-500">just scroll.</span>)
          </li>
          <li>Built with Svelte for a responsive UI</li>
        </ul>

        <div>
          <img
            src="/screenshot-v0.1.png"
            alt={`${brand} interface screenshot`}
            class="w-full rounded-xl border border-slate-700 shadow-lg bg-slate-300 hover:bg-slate-100 transition-all duration-500 ease-out"
            loading="lazy"
          />
        </div>
      </div>

      <div class="w-full h-full self-stretch flex flex-col gap-4">
        {#if pendingRestoreCount > 0}
          <div class="flex-none bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <div class="flex items-center justify-between gap-4">
              <div class="text-sm text-slate-300">
                <span class="font-medium">{pendingRestoreCount}</span> file{pendingRestoreCount ===
                1
                  ? ""
                  : "s"} from your previous session
              </div>
              <button
                type="button"
                class="flex items-center gap-2 px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                onclick={() => onrestorependingfiles?.()}
                disabled={isRestoring}
              >
                {#if isRestoring}
                  <Icon name="spinner" class="w-4 h-4 animate-spin" />
                  Restoring...
                {:else}
                  <Icon name="refresh" class="w-4 h-4" />
                  Restore
                {/if}
              </button>
            </div>
          </div>
        {/if}
        <div class="flex-1 min-h-0">
          <FileUpload onfileselectmultiple={onfileselectmultiple} />
        </div>
      </div>
    </div>
  </div>
</div>
