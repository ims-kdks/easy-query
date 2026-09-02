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
import SQLEditor from "./SQLEditor.svelte";

interface Props {
  tables: TableInfo[];
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  isQuerying: boolean;
  activeTable: string | null;
  query: string;
  onquery?: (sql: string) => void | Promise<void>;
  onfileselectmultiple?: (files: File[]) => void | Promise<void>;
  ontabledelete?: (tableName: string) => void | Promise<void>;
  ontableclick?: (tableName: string) => void;
  onsort?: (data: { column: string; direction: SortDirection }) => void;
  onfilter?: (data: { column: string; value: string }) => void;
}

let {
  tables,
  columns,
  rows,
  totalRows,
  isQuerying,
  activeTable,
  query,
  onquery,
  onfileselectmultiple,
  ontabledelete,
  ontableclick,
  onsort,
  onfilter,
}: Props = $props();

// Panel width persistence
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 800;
const DEFAULT_PANEL_WIDTH = 384; // w-96 = 24rem = 384px
let panelWidth = $state(DEFAULT_PANEL_WIDTH);
let isCollapsed = $state(false);
let isResizing = $state(false);
let isDropActive = $state(false);
let pageDragDepth = 0;
let feedbackMessage = $state<string | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

// Load persisted state on mount
$effect(() => {
  const savedWidth = localStorage.getItem("csvstudio:panelWidth");
  const savedCollapsed = localStorage.getItem("csvstudio:panelCollapsed");

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
});

// Persist state when it changes
$effect(() => {
  localStorage.setItem("csvstudio:panelWidth", String(panelWidth));
});

$effect(() => {
  localStorage.setItem("csvstudio:panelCollapsed", String(isCollapsed));
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
                    {query}
                    isLoading={isQuerying}
                    oncollapse={toggleCollapse}
                />
            </div>

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
            class="flex-none border-b border-slate-700 bg-slate-950/50 px-2 pt-2"
        >
            <div
                class="flex items-end gap-1 overflow-x-auto"
                role="tablist"
                aria-label="Open tables"
            >
                {#each tables as table (table.name)}
                    {@const isActive = table.name === activeTable}
                    <div
                        class="group flex min-w-36 max-w-56 flex-none items-center rounded-t-lg border border-b-0 {isActive
                            ? 'border-slate-600 bg-slate-900 text-slate-100'
                            : 'border-transparent bg-slate-800/60 text-slate-400 hover:bg-slate-800 hover:text-slate-200'}"
                    >
                        <button
                            type="button"
                            role="tab"
                            aria-selected={isActive}
                            tabindex="0"
                            class="min-w-0 flex-1 truncate px-3 py-2 text-left text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-500/60"
                            onclick={() => ontableclick?.(table.name)}
                            title={`${table.name} · ${table.fileName}`}
                        >
                            {table.name}
                        </button>
                        <button
                            type="button"
                            class="mr-1 flex h-6 w-6 flex-none items-center justify-center rounded text-slate-500 opacity-70 transition-colors hover:bg-slate-700 hover:text-red-400 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 group-hover:opacity-100"
                            aria-label={`Close ${table.name}`}
                            title={`Close ${table.name}`}
                            onclick={() => ontabledelete?.(table.name)}
                        >
                            <Icon name="x" class="h-3.5 w-3.5" />
                        </button>
                    </div>
                {/each}
                <div class="flex-none pb-1 pl-1">
                    <FileUpload
                        compact={true}
                        compactIconOnly={true}
                        {onfileselectmultiple}
                    />
                </div>
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
