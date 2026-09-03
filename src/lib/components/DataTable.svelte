<script lang="ts">
import { onDestroy } from "svelte";
import type { ColumnInfo } from "$lib/duckdb/client";
import { loadMoreRows } from "$lib/duckdb/client";
import Icon from "./Icon.svelte";
import Modal from "./Modal.svelte";

interface Props {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  totalRows: number;
  isLoading?: boolean;
  onsort?: (data: {
    column: string;
    direction: "asc" | "desc" | "none";
  }) => void;
  onfilter?: (data: { column: string; value: string }) => void;
}

let {
  columns,
  rows,
  totalRows,
  isLoading = false,
  onsort,
  onfilter,
}: Props = $props();

// Virtual scrolling config
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 56;
const BUFFER_SIZE = 10;
const LOAD_THRESHOLD = 200;

let containerEl = $state<HTMLDivElement | null>(null);
let scrollTop = $state(0);
let containerHeight = $state(600);

// Column widths for resizing
let columnWidths = $state<Record<string, number>>({});
let resizingColumn = $state<string | null>(null);
let resizeStartX = $state(0);
let resizeStartWidth = $state(0);

// Sort state
let sortColumn = $state<string | null>(null);
let sortDirection = $state<"asc" | "desc" | "none">("none");

// Filter state
let activeFilterColumn = $state<string | null>(null);
let filterValues = $state<Record<string, string>>({});
let selectedRowIndex = $state<number | null>(null);
let showRowDetailsDialog = $state(false);
let selectedRow = $derived(
  selectedRowIndex === null ? null : (rows[selectedRowIndex] ?? null),
);

// Calculate visible range
let visibleRange = $derived(() => {
  const adjustedScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT);
  const rawStart = Math.floor(adjustedScrollTop / ROW_HEIGHT) - BUFFER_SIZE;
  const maxStart = Math.max(0, rows.length - 1); // avoid overshooting loaded rows when jumping to bottom
  const startIndex = Math.max(0, Math.min(maxStart, rawStart));
  const visibleCount =
    Math.ceil(containerHeight / ROW_HEIGHT) + BUFFER_SIZE * 2;
  const endIndex = Math.min(rows.length, startIndex + visibleCount);
  return { startIndex, endIndex };
});

// Visible rows slice
let visibleRows = $derived(
  rows.slice(visibleRange().startIndex, visibleRange().endIndex),
);

// Total scrollable height (only as tall as loaded rows to avoid giant empty jumps)
let totalHeight = $derived(Math.max(rows.length, 1) * ROW_HEIGHT);

// Offset for visible rows
let offsetY = $derived(visibleRange().startIndex * ROW_HEIGHT);

function maybeLoadMore(target?: HTMLDivElement) {
  const el = target ?? containerEl;
  if (!el) return;

  const loadedHeight = rows.length * ROW_HEIGHT;
  const scrollBottomLoaded = loadedHeight - el.scrollTop - el.clientHeight;
  if (
    scrollBottomLoaded < LOAD_THRESHOLD &&
    rows.length < totalRows &&
    !isLoading
  ) {
    loadMoreRows();
  }
}

function handleScroll(e: Event) {
  const target = e.target as HTMLDivElement;
  scrollTop = target.scrollTop;

  // Close filter popover on scroll
  activeFilterColumn = null;

  maybeLoadMore(target);
}

function handleResize() {
  if (containerEl) {
    containerHeight = containerEl.clientHeight;
  }
}

function getColumnWidth(colName: string): number {
  return columnWidths[colName] || 180;
}

function startResize(e: MouseEvent, colName: string) {
  e.preventDefault();
  e.stopPropagation();
  resizingColumn = colName;
  resizeStartX = e.clientX;
  resizeStartWidth = columnWidths[colName] || 180;

  window.addEventListener("mousemove", onResize);
  window.addEventListener("mouseup", stopResize);
}

function onResize(e: MouseEvent) {
  if (!resizingColumn) return;
  const diff = e.clientX - resizeStartX;
  columnWidths[resizingColumn] = Math.max(100, resizeStartWidth + diff);
}

function stopResize() {
  resizingColumn = null;
  window.removeEventListener("mousemove", onResize);
  window.removeEventListener("mouseup", stopResize);
}

onDestroy(() => {
  stopResize();
});

function handleSort(colName: string) {
  if (sortColumn === colName) {
    if (sortDirection === "asc") {
      sortDirection = "desc";
    } else if (sortDirection === "desc") {
      sortDirection = "none";
      sortColumn = null;
    } else {
      sortDirection = "asc";
    }
  } else {
    sortColumn = colName;
    sortDirection = "asc";
  }

  const nextDirection = sortColumn ? sortDirection : "none";
  onsort?.({ column: colName, direction: nextDirection });
}

function handleSortKeyboard(event: KeyboardEvent, colName: string) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    handleSort(colName);
  }
}

function toggleFilter(colName: string, e: MouseEvent) {
  e.stopPropagation();
  activeFilterColumn = activeFilterColumn === colName ? null : colName;
}

function applyFilter(colName: string) {
  onfilter?.({ column: colName, value: filterValues[colName] || "" });
  activeFilterColumn = null;
}

function clearFilter(colName: string) {
  filterValues[colName] = "";
  onfilter?.({ column: colName, value: "" });
  activeFilterColumn = null;
}

function openRowDetails(rowIndex: number) {
  selectedRowIndex = rowIndex;
  showRowDetailsDialog = true;
}

function closeRowDetails() {
  showRowDetailsDialog = false;
  selectedRowIndex = null;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
}

function toSafeClickableUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return null;
  }

  return null;
}

interface UrlSegment {
  text: string;
  href: string | null;
}

function splitTextByUrls(input: string): UrlSegment[] {
  if (!input) {
    return [];
  }

  const segments: UrlSegment[] = [];
  const urlPattern = /https?:\/\/[^\s<>"']+/g;
  let startIndex = 0;

  for (const match of input.matchAll(urlPattern)) {
    const matchedText = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > startIndex) {
      segments.push({
        text: input.slice(startIndex, matchIndex),
        href: null,
      });
    }

    let candidate = matchedText;
    let trailing = "";
    while (/[),.!?:;\]]$/.test(candidate)) {
      trailing = candidate.slice(-1) + trailing;
      candidate = candidate.slice(0, -1);
    }

    const safeUrl = toSafeClickableUrl(candidate);
    if (safeUrl) {
      segments.push({ text: candidate, href: safeUrl });
      if (trailing) {
        segments.push({ text: trailing, href: null });
      }
    } else {
      segments.push({ text: matchedText, href: null });
    }

    startIndex = matchIndex + matchedText.length;
  }

  if (startIndex < input.length) {
    segments.push({ text: input.slice(startIndex), href: null });
  }

  return segments;
}

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch (error) {
    console.warn("Failed to copy value to clipboard:", error);
  }
}

function formatType(type: string): string {
  return type.toLowerCase();
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "null";
  }
  if (typeof value === "object") {
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

// Calculate total table width
let tableWidth = $derived(() => {
  const rowNumWidth = 56;
  const columnsWidth = columns.reduce(
    (sum, col) => sum + getColumnWidth(col.name),
    0,
  );
  return rowNumWidth + columnsWidth;
});

// If more rows are needed for the current scroll position (e.g., jump to bottom), keep loading
$effect(() => {
  maybeLoadMore();
});

$effect(() => {
  if (containerEl) {
    const observer = new ResizeObserver(() => handleResize());
    observer.observe(containerEl);
    handleResize();
    return () => observer.disconnect();
  }
});

// Initialize column widths
$effect(() => {
  if (columns.length > 0 && Object.keys(columnWidths).length === 0) {
    const initialWidths: Record<string, number> = {};
    columns.forEach((col) => {
      initialWidths[col.name] = 180;
    });
    columnWidths = initialWidths;
  }
});

// Close filter when clicking outside
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest(".filter-popover") && !target.closest(".filter-btn")) {
    activeFilterColumn = null;
  }
}
</script>

<svelte:window on:click={handleClickOutside} />

<div class="h-full flex flex-col bg-slate-900">
    {#if columns.length === 0}
        <div class="flex-1 flex items-center justify-center text-slate-500">
            <p>No data loaded</p>
        </div>
    {:else}
        <div
            bind:this={containerEl}
            class="flex-1 overflow-auto"
            onscroll={handleScroll}
        >
            <div style="min-width: {tableWidth()}px; position: relative;">
                <!-- Sticky Header -->
                <div
                    class="sticky top-0 z-10 flex border-b border-slate-600 bg-slate-800"
                    style="height: {HEADER_HEIGHT}px;"
                >
                    <!-- Row number header -->
                    <div
                        class="sticky left-0 z-20 flex-none w-14 px-2 flex items-center justify-center text-xs font-medium text-slate-500 border-r border-slate-700 bg-slate-800"
                    >
                        #
                    </div>

                    {#each columns as col (col.name)}
                        {@const isActive = sortColumn === col.name}
                        {@const hasFilter = filterValues[col.name]}
                        <div
                            role="button"
                            tabindex="0"
                            class="relative flex flex-col justify-center px-3 py-1.5 border-r border-slate-700 group bg-slate-800 cursor-pointer hover:bg-slate-700"
                            style="width: {getColumnWidth(
                                col.name,
                            )}px; min-width: {getColumnWidth(col.name)}px;"
                            onclick={() => handleSort(col.name)}
                            onkeydown={(e) => handleSortKeyboard(e, col.name)}
                        >
                            <!-- Top row: Column name + controls -->
                            <div class="flex items-center gap-1">
                                <span
                                    class="flex-1 truncate text-sm font-medium text-slate-200"
                                    title={col.name}
                                >
                                    {col.name}
                                </span>

                                <!-- Sort indicator -->
                                <button
                                    type="button"
                                    class="flex-none p-0.5 rounded transition-colors
                         {isActive
                                        ? 'text-emerald-500'
                                        : 'text-slate-500 opacity-0 group-hover:opacity-100'}"
                                    onclick={(e) => {
                                        e.stopPropagation();
                                        handleSort(col.name);
                                    }}
                                    title="Sort"
                                >
                                    {#if isActive && sortDirection === "desc"}
                                        <Icon
                                            name="chevron-down"
                                            class="w-3.5 h-3.5"
                                        />
                                    {:else}
                                        <Icon
                                            name="chevron-up"
                                            class="w-3.5 h-3.5"
                                        />
                                    {/if}
                                </button>

                                <!-- Filter button -->
                                <button
                                    type="button"
                                    class="filter-btn flex-none p-0.5 rounded transition-colors
                         {hasFilter
                                        ? 'text-emerald-500'
                                        : 'text-slate-500 opacity-0 group-hover:opacity-100'}"
                                    onclick={(e) => toggleFilter(col.name, e)}
                                    title="Filter"
                                >
                                    <Icon name="filter" class="w-3.5 h-3.5" />
                                </button>
                            </div>

                            <!-- Bottom row: Type -->
                            <span class="text-xs text-slate-500 mt-0.5"
                                >{formatType(col.type)}</span
                            >

                            <!-- Filter popover -->
                            {#if activeFilterColumn === col.name}
                                <div
                                    role="dialog"
                                    tabindex="-1"
                                    class="filter-popover absolute top-full left-0 mt-1 w-48 p-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl z-20"
                                    onclick={(e) => e.stopPropagation()}
                                    onkeydown={(e) =>
                                        e.key === "Escape" &&
                                        (activeFilterColumn = null)}
                                >
                                    <input
                                        type="text"
                                        bind:value={filterValues[col.name]}
                                        placeholder="Filter value..."
                                        class="w-full px-2 py-1.5 text-sm bg-slate-900 border border-slate-600 rounded
                           text-slate-200 placeholder:text-slate-500"
                                        onkeydown={(e) =>
                                            e.key === "Enter" &&
                                            applyFilter(col.name)}
                                    />
                                    <div class="flex gap-1 mt-2">
                                        <button
                                            type="button"
                                            class="flex-1 px-2 py-1 text-xs bg-emerald-500 text-slate-900 rounded hover:bg-emerald-400"
                                            onclick={() =>
                                                applyFilter(col.name)}
                                        >
                                            Apply
                                        </button>
                                        <button
                                            type="button"
                                            class="flex-1 px-2 py-1 text-xs bg-slate-700 text-slate-300 rounded hover:bg-slate-600"
                                            onclick={() =>
                                                clearFilter(col.name)}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            {/if}

                            <!-- Resize handle -->
                            <button
                                type="button"
                                aria-label="Resize column {col.name}"
                                class="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize opacity-0 group-hover:opacity-100
                       bg-emerald-500/50 hover:bg-emerald-500 transition-opacity border-0 p-0"
                                onmousedown={(e) => startResize(e, col.name)}
                                onclick={(e) => e.stopPropagation()}
                            ></button>
                        </div>
                    {/each}
                </div>

                <!-- Virtual scroll body -->
                <div style="height: {totalHeight}px; position: relative;">
                    <div style="transform: translateY({offsetY}px);">
                        {#each visibleRows as row, i (visibleRange().startIndex + i)}
                            {@const rowIndex = visibleRange().startIndex + i}
                            <div
                                class="flex border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                                style="height: {ROW_HEIGHT}px;"
                            >
                                <button
                                    type="button"
                                    class="sticky left-0 z-10 flex-none w-14 px-2 flex items-center justify-center text-xs text-slate-400 border-r border-slate-800 bg-slate-900 transition-colors hover:bg-slate-800 hover:text-emerald-400 focus:outline-none focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-emerald-500/60"
                                    onclick={() => openRowDetails(rowIndex)}
                                    aria-label={`Open details for row ${rowIndex + 1}`}
                                >
                                    {rowIndex + 1}
                                </button>

                                {#each columns as col (col.name)}
                                    {@const value = formatCellValue(
                                        row[col.name],
                                    )}
                                    {@const displayValue = value || "null"}
                                    {@const valueSegments =
                                        splitTextByUrls(displayValue)}
                                    <div
                                        role="gridcell"
                                        tabindex="-1"
                                        class="flex items-center px-3 border-r border-slate-800 group cursor-default"
                                        style="width: {getColumnWidth(
                                            col.name,
                                        )}px; min-width: {getColumnWidth(
                                            col.name,
                                        )}px;"
                                        title={value}
                                        ondblclick={() =>
                                            copyToClipboard(value)}
                                    >
                                        <span
                                            class="truncate text-sm {value ===
                                            ''
                                                ? 'text-slate-600 italic'
                                                : 'text-slate-300'}"
                                        >
                                            {#each valueSegments as segment, segmentIndex (`${col.name}-${rowIndex}-${segmentIndex}`)}
                                                {#if segment.href}
                                                    <a
                                                        href={segment.href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        class="text-emerald-400 underline decoration-emerald-700 underline-offset-2 hover:text-emerald-300"
                                                        title={segment.href}
                                                        onclick={(event) =>
                                                            event.stopPropagation()}
                                                    >
                                                        {segment.text}
                                                    </a>
                                                {:else}
                                                    {segment.text}
                                                {/if}
                                            {/each}
                                        </span>

                                        {#if value}
                                            <button
                                                type="button"
                                                class="ml-auto pl-2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-emerald-500 transition-opacity"
                                                onclick={() =>
                                                    copyToClipboard(value)}
                                                title="Copy to clipboard"
                                            >
                                                <Icon
                                                    name="copy"
                                                    class="w-3.5 h-3.5"
                                                />
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {/each}

                        {#if isLoading}
                            <div
                                class="flex items-center justify-center py-4 text-slate-500"
                            >
                                <Icon
                                    name="spinner"
                                    class="w-5 h-5 animate-spin mr-2"
                                />
                                <span class="text-sm">Loading more rows...</span
                                >
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}
</div>

<Modal
    open={showRowDetailsDialog && Boolean(selectedRow)}
    title={selectedRowIndex === null
        ? "Row details"
        : `Row ${selectedRowIndex + 1} details`}
    onclose={closeRowDetails}
    size="lg"
>
    {#if selectedRow}
        <div class="space-y-2">
            {#each columns as col (col.name)}
                {@const detailValue = formatDetailValue(selectedRow[col.name])}
                {@const detailSegments = splitTextByUrls(detailValue)}
                <div class="rounded-lg border border-slate-700 bg-slate-800/40">
                    <div class="border-b border-slate-700 px-3 py-1.5">
                        <div class="text-xs font-medium text-emerald-500">
                            {col.name}
                        </div>
                        <div class="text-[11px] text-slate-500">
                            {formatType(col.type)}
                        </div>
                    </div>
                    <div
                        class="overflow-x-auto whitespace-pre-wrap break-all px-3 py-2 text-xs text-slate-200"
                    >
                        {#each detailSegments as segment, segmentIndex (`${col.name}-detail-${segmentIndex}`)}
                            {#if segment.href}
                                <a
                                    href={segment.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="text-emerald-400 underline decoration-emerald-700 underline-offset-2 hover:text-emerald-300"
                                >
                                    {segment.text}
                                </a>
                            {:else}
                                {segment.text}
                            {/if}
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    {:else}
        <p class="text-sm text-slate-400">Row data is unavailable.</p>
    {/if}
</Modal>
