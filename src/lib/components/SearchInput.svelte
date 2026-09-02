<script lang="ts">
import { onDestroy } from "svelte";
import Icon from "./Icon.svelte";

interface Props {
  value?: string;
  placeholder?: string;
  mode?: "enter" | "debounce" | "instant";
  debounceMs?: number;
  oninput?: (value: string) => void;
  onsearch?: (value: string) => void;
}

let {
  value = "",
  placeholder = "Search...",
  mode = "enter",
  debounceMs = 300,
  oninput,
  onsearch,
}: Props = $props();

let localValue = $state("");
let debounceId: ReturnType<typeof setTimeout> | null = null;

$effect(() => {
  localValue = value;
});

onDestroy(() => {
  if (debounceId) clearTimeout(debounceId);
});

function emitSearch(next: string) {
  onsearch?.(next);
}

function handleInput(e: Event) {
  const next = (e.target as HTMLInputElement).value;
  localValue = next;
  oninput?.(next);

  if (mode === "instant") {
    emitSearch(next);
    return;
  }

  if (mode === "debounce") {
    if (debounceId) clearTimeout(debounceId);
    debounceId = setTimeout(() => emitSearch(next), debounceMs);
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (mode === "enter" && e.key === "Enter") {
    emitSearch(localValue);
  }
}

function clear() {
  localValue = "";
  oninput?.("");
  emitSearch("");
}
</script>

<div class="relative max-w-md">
  <Icon name="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
  <input
    type="text"
    value={localValue}
    placeholder={placeholder}
    class="w-full pl-9 pr-4 py-1.5 text-sm bg-slate-900 border border-slate-700 
           rounded-lg text-slate-200 placeholder:text-slate-500"
    oninput={handleInput}
    onkeydown={handleKeydown}
  />
  {#if localValue}
    <button
      type="button"
      onclick={clear}
      class="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-300"
      aria-label="Clear search"
    >
      <Icon name="x" class="w-3.5 h-3.5" />
    </button>
  {/if}
</div>
