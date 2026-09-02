<script lang="ts">
import { onDestroy } from "svelte";
import type { ColumnInfo, TableInfo } from "$lib/duckdb/client";
import type { SortDirection } from "$lib/duckdb/uiQuery";
import {
  isFileDragEvent,
  partitionSupportedDataFiles,
  SUPPORTED_DATA_FILE_EXTENSIONS,
  storeDroppedFileHandles,
} from "$lib/fileUpload";
import DataTable from "./DataTable.svelte";
import FileUpload from "./FileUpload.svelte";
import Icon from "./Icon.svelte";
import SearchInput from "./SearchInput.svelte";
import SQLEditor from "./SQLEditor.svelte";

interface Props {
  tables: TableInfo[];
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  isQuerying: boolean;
  isExporting: boolean;
  onquery?: (sql: string) => void | Promise<void>;
  onfileselectmultiple?: (files: File[]) => void | Promise<void>;
  ontabledelete?: (tableName: string) => void | Promise<void>;
  ontableclick?: (tableName: string) => void;
  onsearch?: (searchTerm: string) => void;
  onsort?: (data: { column: string; direction: SortDirection }) => void;
  onfilter?: (data: { column: string; value: string }) => void;
  onopenexport?: () => void;
}

let {
  tables,
  columns,
  rows,
  totalRows,
  isQuerying,
  isExporting,
  onquery,
  onfileselectmultiple,
  ontabledelete,
  ontableclick,
  onsearch,
  onsort,
  onfilter,
  onopenexport,
}: Props = $props();

// Panel width persistence
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 384; // w-96 = 24rem = 384px
let panelWidth = $state(DEFAULT_PANEL_WIDTH);
let isCollapsed = $state(false);
let isResizing = $state(false);

// Tables section height persistence
const MIN_TABLES_HEIGHT = 120;
const DEFAULT_TABLES_HEIGHT = 200;
let tablesHeight = $state(DEFAULT_TABLES_HEIGHT);
let isResizingTables = $state(false);
let isDropActive = $state(false);
let pageDragDepth = 0;
let feedbackMessage = $state<string | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

// Load persisted state on mount
$effect(() => {
  const savedWidth = localStorage.getItem("csvstudio:panelWidth");
  const savedCollapsed = localStorage.getItem("csvstudio:panelCollapsed");
  const savedTablesHeight = localStorage.getItem("csvstudio:tablesHeight");

  if (savedWidth) {
    const width = Number.parseInt(savedWidth, 10);
    if (
      !Number.isNaN(width) &&
      width >= MIN_PANEL_WIDTH &&
      width <= MAX_PANEL_WIDTH
    ) {
      panelWidth = width;
    }
  }
  if (savedCollapsed === "true") {
    isCollapsed = true;
  }
  if (savedTablesHeight) {
    const height = Number.parseInt(savedTablesHeight, 10);
    if (!Number.isNaN(height) && height >= MIN_TABLES_HEIGHT) {
      tablesHeight = height;
    }
  }
});

// Persist state when it changes
$effect(() => {
  localStorage.setItem("csvstudio:panelWidth", String(panelWidth));
});

$effect(() => {
  localStorage.setItem("csvstudio:panelCollapsed", String(isCollapsed));
});

$effect(() => {
  localStorage.setItem("csvstudio:tablesHeight", String(tablesHeight));
});

function startResize(e: MouseEvent) {
  e.preventDefault();
  isResizing = true;

  const startX = e.clientX;
  const startWidth = panelWidth;

  function onMove(e: MouseEvent) {
    const delta = e.clientX - startX;
    const newWidth = startWidth + delta;
    panelWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
  }

  function onUp() {
    isResizing = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function startResizeTables(e: MouseEvent) {
  e.preventDefault();
  isResizingTables = true;

  const startY = e.clientY;
  const startHeight = tablesHeight;

  function onMove(e: MouseEvent) {
    const delta = startY - e.clientY;
    const newHeight = startHeight + delta;
    tablesHeight = Math.max(MIN_TABLES_HEIGHT, newHeight);
  }

  function onUp() {
    isResizingTables = false;
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

function toggleCollapse() {
  isCollapsed = !isCollapsed;
}

function resetDropState() {
  pageDragDepth = 0;
  isDropActive = false;
}

function showFeedback(message: string) {
  feedbackMessage = message;
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
  }
  feedbackTimer = setTimeout(() => {
    feedbackMessage = null;
    feedbackTimer = null;
  }, 4500);
}

function processDroppedFiles(files: File[]) {
  const { supportedFiles, skippedCount } = partitionSupportedDataFiles(files);

  if (supportedFiles.length === 0) {
    showFeedback("Please select CSV, TSV, Parquet, JSON, or JSONL files.");
    return;
  }

  if (skippedCount > 0) {
    showFeedback(
      `Loaded ${supportedFiles.length} of ${files.length} files. Some files were skipped.`,
    );
  }

  void onfileselectmultiple?.(supportedFiles);
}

function handleWindowDragEnter(event: DragEvent) {
  if (!isFileDragEvent(event)) return;

  event.preventDefault();
  pageDragDepth += 1;
  isDropActive = true;
}

function handleWindowDragOver(event: DragEvent) {
  if (!isFileDragEvent(event)) return;

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  isDropActive = true;
}

function handleWindowDragLeave(event: DragEvent) {
  if (!isDropActive || !isFileDragEvent(event)) return;

  event.preventDefault();
  pageDragDepth = Math.max(pageDragDepth - 1, 0);
  if (pageDragDepth === 0) {
    isDropActive = false;
  }
}

function handleWindowDrop(event: DragEvent) {
  if (!isFileDragEvent(event)) return;

  event.preventDefault();
  const { dataTransfer } = event;
  const droppedFiles = Array.from(dataTransfer?.files ?? []);
  resetDropState();

  if (droppedFiles.length === 0) return;
  void storeDroppedFileHandles(dataTransfer);
  processDroppedFiles(droppedFiles);
}

onDestroy(() => {
  if (feedbackTimer) {
    clearTimeout(feedbackTimer);
  }
});
</script>

<svelte:window
    ondragenter={handleWindowDragEnter}
    ondragover={handleWindowDragOver}
    ondragleave={handleWindowDragLeave}
    ondrop={handleWindowDrop}
/>

<div class="flex-1 flex overflow-hidden">
    {#if !isCollapsed}
        <div
            class="flex-none border-r border-slate-700 flex flex-col bg-slate-900 relative"
            style="width: {panelWidth}px"
        >
            <div class="flex-1 overflow-hidden flex flex-col min-h-0">
                <SQLEditor
                    onexecute={onquery}
                    {tables}
                    isLoading={isQuerying}
                    oncollapse={toggleCollapse}
                />
            </div>

            {#if tables.length > 0}
                <button
                    type="button"
                    class="h-1 cursor-ns-resize hover:bg-emerald-500/50 transition-colors {isResizingTables
                        ? 'bg-emerald-500/50'
                        : ''}"
                    onmousedown={startResizeTables}
                    aria-label="Resize tables section"
                ></button>

                <div
                    class="flex-none border-t border-slate-700 bg-slate-800/30 flex flex-col overflow-hidden"
                    style="height: {tablesHeight}px"
                >
                    <div class="flex min-h-0 flex-1 flex-col px-2 py-2">
                        <h3 class="mb-1.5 px-1 text-xs font-medium text-slate-400">
                            {tables.length}
                            {tables.length === 1 ? "table" : "tables"} loaded
                        </h3>
                        <div class="min-h-0 flex-1 space-y-1 overflow-y-auto">
                            {#each tables as table (table.name)}
                                <div class="flex h-9 items-stretch gap-1">
                                    <button
                                        type="button"
                                        class="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 text-left transition-colors hover:border-emerald-500 hover:bg-emerald-500/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                                        onclick={() =>
                                            ontableclick?.(table.name)}
                                        title={`${table.fileName} · ${table.rowCount.toLocaleString()} rows · ${table.columns.length} columns`}
                                        aria-label={`View ${table.name}`}
                                    >
                                        <div class="flex min-w-0 items-baseline gap-2">
                                            <span
                                                class="min-w-0 flex-1 truncate text-xs font-medium text-slate-200"
                                            >{table.name}</span>
                                            <span
                                                class="flex-none text-[10px] text-slate-500"
                                            >
                                                {table.rowCount.toLocaleString()} × {table.columns.length}
                                            </span>
                                        </div>
                                    </button>
                                    <button
                                        type="button"
                                        class="flex w-8 items-center justify-center rounded border border-slate-700 text-slate-500 transition-colors hover:border-red-400 hover:bg-red-500/10 hover:text-red-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60"
                                        aria-label={`Delete ${table.name}`}
                                        title={`Delete ${table.name}`}
                                        onclick={() =>
                                            ontabledelete?.(table.name)}
                                    >
                                        <Icon name="trash" class="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            {/each}
                        </div>

                        <div class="mt-2 border-t border-slate-700 pt-2">
                            <FileUpload compact={true} {onfileselectmultiple} />
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Horizontal resize handle -->
            <button
                type="button"
                class="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-emerald-500/50 transition-colors {isResizing
                    ? 'bg-emerald-500/50'
                    : ''}"
                onmousedown={startResize}
                aria-label="Resize panel"
            ></button>
        </div>
    {:else}
        <!-- Collapsed state - show expand button -->
        <div
            class="flex-none border-r border-slate-700 bg-slate-900 flex flex-col items-center p-2"
        >
            <button
                type="button"
                onclick={toggleCollapse}
                class="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                title="Show panel"
                aria-label="Show panel"
            >
                <Icon name="panel" class="w-5 h-5" />
            </button>

            {#if tables.length > 0}
                <div
                    class="mt-2 w-8 h-8 flex items-center justify-center rounded bg-slate-800 text-s font-light text-slate-400"
                    title={`${tables.length} tables loaded`}
                >
                    {tables.length}
                </div>
            {/if}
        </div>
    {/if}

    <div class="flex-1 flex flex-col overflow-hidden bg-slate-900">
        <div
            class="flex-none bg-slate-800/30 border-b border-slate-700 px-4 py-2.5"
        >
            <div class="flex items-center gap-3">
                <SearchInput
                    placeholder="Search all columns..."
                    mode="enter"
                    {onsearch}
                />
                <button
                    type="button"
                    class="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onclick={() => onopenexport?.()}
                    disabled={isExporting || isQuerying || tables.length === 0}
                >
                    {#if isExporting}
                        <Icon name="spinner" class="w-4 h-4 animate-spin" />
                        Exporting
                    {:else}
                        <Icon name="download" class="w-4 h-4" />
                        Export
                    {/if}
                </button>
            </div>
        </div>

        <div class="flex-1 overflow-hidden">
            <DataTable
                {columns}
                {rows}
                {totalRows}
                isLoading={isQuerying}
                {onsort}
                {onfilter}
            />
        </div>
    </div>
</div>

{#if isDropActive}
    <div
        class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
    >
        <div
            class="w-full max-w-xl rounded-2xl border-2 border-dashed border-emerald-400 bg-slate-900/90 px-8 py-7 text-center shadow-2xl"
        >
            <p class="text-2xl font-semibold text-emerald-300">
                Drop anywhere to add files
            </p>
            <p class="mt-2 text-sm text-slate-300">
                Supported formats: {SUPPORTED_DATA_FILE_EXTENSIONS.join(", ")}
            </p>
        </div>
    </div>
{/if}

{#if feedbackMessage}
    <div
        class="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-slate-600 bg-slate-900/95 px-4 py-2 text-sm text-slate-200 shadow-lg"
    >
        {feedbackMessage}
    </div>
{/if}
