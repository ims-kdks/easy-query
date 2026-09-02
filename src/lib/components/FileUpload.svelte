<script lang="ts">
import { onDestroy } from "svelte";
import {
  isFileSystemAccessSupported,
  openFilePicker as openFilePickerWithHandles,
  storeFileHandle,
} from "$lib/fileHandleStore";
import {
  isFileDragEvent,
  partitionSupportedDataFiles,
  SUPPORTED_DATA_FILE_ACCEPT,
  SUPPORTED_DATA_FILE_EXTENSIONS,
  storeDroppedFileHandles,
} from "$lib/fileUpload";
import Icon from "./Icon.svelte";

interface Props {
  compact?: boolean;
  onfileselectmultiple?: (files: File[]) => void | Promise<void>;
}

let { compact = false, onfileselectmultiple }: Props = $props();
let fileInput: HTMLInputElement;
let isDropActive = $state(false);
let pageDragDepth = 0;
let feedbackMessage = $state<string | null>(null);
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

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

function processFiles(files: File[]) {
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
  if (compact || !isFileDragEvent(event)) return;

  event.preventDefault();
  pageDragDepth += 1;
  isDropActive = true;
}

function handleWindowDragOver(event: DragEvent) {
  if (compact || !isFileDragEvent(event)) return;

  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
  isDropActive = true;
}

function handleWindowDragLeave(event: DragEvent) {
  if (compact || !isDropActive || !isFileDragEvent(event)) return;

  event.preventDefault();
  pageDragDepth = Math.max(pageDragDepth - 1, 0);
  if (pageDragDepth === 0) {
    isDropActive = false;
  }
}

function handleWindowDrop(event: DragEvent) {
  if (compact || !isFileDragEvent(event)) return;

  event.preventDefault();
  const { dataTransfer } = event;
  const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
  resetDropState();

  if (droppedFiles.length === 0) return;
  void storeDroppedFileHandles(dataTransfer);
  processFiles(droppedFiles);
}

function handleFileSelect(e: Event) {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    processFiles(Array.from(files));
  }
  // Reset value so selecting the same file again still triggers `change`.
  target.value = "";
}

async function openFilePicker() {
  // Use File System Access API if available (Chromium browsers)
  // This allows us to store file handles for later restoration
  if (isFileSystemAccessSupported()) {
    try {
      const results = await openFilePickerWithHandles();
      if (results.length === 0) return;

      const files: File[] = [];
      for (const { file, handle } of results) {
        files.push(file);
        // Store the handle for persistence
        await storeFileHandle(handle);
      }

      processFiles(files);
    } catch (error) {
      console.error("File picker error:", error);
      // Fall back to traditional file input
      fileInput?.click();
    }
  } else {
    // Fall back to traditional file input for Firefox/Safari
    fileInput?.click();
  }
}

function openFilePickerFromKeyboard(event: KeyboardEvent) {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    void openFilePicker();
  }
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

<input
    bind:this={fileInput}
    type="file"
    accept={SUPPORTED_DATA_FILE_ACCEPT}
    multiple={true}
    class="hidden"
    onchange={handleFileSelect}
/>

{#if compact}
    <!-- Compact button for header -->
    <button
        type="button"
        onclick={openFilePicker}
        class="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-slate-800 hover:bg-slate-700
           border border-slate-600 rounded-lg transition-colors"
    >
        <Icon name="upload" class="w-4 h-4" />
        <span>Add More Files</span>
    </button>
{:else}
    <!-- Full drop zone for welcome screen -->
    <div
        role="button"
        tabindex="0"
        class="relative w-full h-full"
        onclick={openFilePicker}
        onkeydown={openFilePickerFromKeyboard}
    >
        <div
            class="h-full border-2 border-dashed rounded-xl p-8 text-center cursor-pointer
               flex items-center justify-center transition-all duration-200 ease-out
               {isDropActive
                ? 'border-emerald-400 bg-slate-800/60'
                : 'border-slate-600 hover:border-slate-500 hover:bg-slate-800/50'}"
        >
            <div class="flex flex-col items-center gap-4">
                <div
                    class="w-20 h-20 rounded-full bg-slate-800 flex items-center justify-center text-slate-400"
                >
                    <Icon name="upload" class="w-10 h-10" />
                </div>
                <div>
                    <p class="text-slate-200 text-2xl font-medium">
                        Drag files anywhere
                    </p>
                    <p class="text-slate-500 text-sm mt-1">
                        Or click this area to browse. Your data stays in your
                        browser.
                    </p>
                </div>
                <div class="flex gap-2 text-sm text-slate-500">
                    {#each SUPPORTED_DATA_FILE_EXTENSIONS as extension}
                        <span class="px-2 py-0.5 bg-slate-800 rounded"
                            >{extension}</span
                        >
                    {/each}
                </div>
            </div>
        </div>
    </div>
{/if}

{#if isDropActive}
    <div
        class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm px-4"
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
