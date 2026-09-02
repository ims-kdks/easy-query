<script lang="ts">
import type { Snippet } from "svelte";
import { tick } from "svelte";
import Icon from "./Icon.svelte";

type Size = "sm" | "md" | "lg";

interface Props {
  open?: boolean;
  title?: string;
  size?: Size;
  header?: Snippet;
  footer?: Snippet;
  children?: Snippet;
  onclose?: () => void;
}

let {
  open = false,
  title = "",
  size = "md",
  header,
  footer,
  children,
  onclose,
}: Props = $props();

const sizeClass: Record<Size, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-2xl",
};
const titleId = `modal-title-${Math.random().toString(36).slice(2, 9)}`;

let dialogEl = $state<HTMLDivElement | null>(null);
let previousFocus: HTMLElement | null = null;

function handleBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    close();
  }
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}

function close() {
  onclose?.();
}

$effect(() => {
  if (!open) return;

  previousFocus =
    typeof document !== "undefined" &&
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

  void tick().then(() => {
    dialogEl?.focus();
  });

  return () => {
    previousFocus?.focus();
    previousFocus = null;
  };
});
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    role="presentation"
    onclick={handleBackdropClick}
  >
    <div
      bind:this={dialogEl}
      class={`w-full ${sizeClass[size]} max-h-[calc(100vh-2rem)] rounded-lg border border-slate-700 bg-slate-900 shadow-2xl flex flex-col`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title || header ? titleId : undefined}
      tabindex="-1"
      onkeydown={handleDialogKeydown}
    >
      <div class="flex items-center justify-between border-b border-slate-700 px-4 py-3">
        <div id={titleId} class="text-sm font-semibold text-slate-200">
          {#if header}
            {@render header()}
          {:else}
            {title}
          {/if}
        </div>
        <button
          type="button"
          class="text-slate-400 hover:text-slate-200 focus:outline-none"
          onclick={close}
          aria-label="Close dialog"
        >
          <Icon name="x" class="w-4 h-4" />
        </button>
      </div>
      <div class="px-4 py-3 text-sm text-slate-200 flex-1 min-h-0 overflow-y-auto">
        {@render children?.()}
      </div>
      {#if footer}
        <div class="px-4 py-3 border-t border-slate-700 flex justify-end">
          {@render footer()}
        </div>
      {/if}
    </div>
  </div>
{/if}
