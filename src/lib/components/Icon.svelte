<script lang="ts">
type IconName =
  | "search"
  | "x"
  | "filter"
  | "chevron-up"
  | "chevron-down"
  | "chevron-left"
  | "chevron-right"
  | "panel"
  | "copy"
  | "spinner"
  | "alert-circle"
  | "clock"
  | "code"
  | "upload"
  | "download"
  | "database"
  | "chat"
  | "trash"
  | "refresh"
  | "book";

interface Props {
  name: IconName;
  class?: string;
  title?: string;
  ariaLabel?: string;
}

let { name, class: className = "", title, ariaLabel }: Props = $props();
let isDecorative = $derived(!title && !ariaLabel);
let strokeWidth = $derived(name === "panel" ? 1.6 : 2);
</script>

{#if name === "spinner"}
    <svg
        class={className}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden={isDecorative}
        role={isDecorative ? "presentation" : "img"}
        aria-label={ariaLabel}
    >
        {#if title}
            <title>{title}</title>
        {/if}
        <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
        ></circle>
        <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
    </svg>
{:else}
    <svg
        class={className}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width={strokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden={isDecorative}
        role={isDecorative ? "presentation" : "img"}
        aria-label={ariaLabel}
    >
        {#if title}
            <title>{title}</title>
        {/if}
        {#if name === "search"}
            <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        {:else if name === "x"}
            <path d="M6 18L18 6M6 6l12 12" />
        {:else if name === "filter"}
            <path
                d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
        {:else if name === "chevron-up"}
            <path d="M5 15l7-7 7 7" />
        {:else if name === "chevron-down"}
            <path d="M19 9l-7 7-7-7" />
        {:else if name === "chevron-left"}
            <path d="M15 19l-7-7 7-7" />
        {:else if name === "chevron-right"}
            <path d="M9 5l7 7-7 7" />
        {:else if name === "panel"}
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
        {:else if name === "copy"}
            <path
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
        {:else if name === "alert-circle"}
            <path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        {:else if name === "clock"}
            <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        {:else if name === "code"}
            <path d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        {:else if name === "upload"}
            <path
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
        {:else if name === "download"}
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" />
            <path d="M12 4v12" />
            <path d="M8 12l4 4 4-4" />
        {:else if name === "database"}
            <ellipse cx="12" cy="5" rx="8" ry="3" />
            <path d="M4 5v7c0 1.66 3.58 3 8 3s8-1.34 8-3V5" />
            <path d="M4 12v7c0 1.66 3.58 3 8 3s8-1.34 8-3v-7" />
        {:else if name === "chat"}
            <path
                d="M8 10h.01M12 10h.01M16 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4-.8L3 20l1.324-3.973C3.48 14.913 3 13.502 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
        {:else if name === "trash"}
            <path d="M3 6h18" />
            <path d="M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2" />
            <path d="M6 6l1 14a2 2 0 002 2h6a2 2 0 002-2l1-14" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
        {:else if name === "refresh"}
            <path
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
        {:else if name === "book"}
            <path
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
        {/if}
    </svg>
{/if}
