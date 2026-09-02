## Coding principles to follow
- KISS (Keep It Simple, Stupid)
- YAGNI (You Aren't Gonna Need It)
- SOLID principle
- DRY (Don't Repeat Yourself)
- Always follow the latest best practice
- Avoid pointless abstractions and wrappers
- Do not add helper functions that only wrap a one-liner unless they add real semantic value, safety, or are reused meaningfully
- Prefer direct, readable code at call sites over indirection during cleanup/refactor work
- In Svelte components/pages, avoid pass-through event handlers that only call an existing function; wire the existing function directly when possible

## Testing
- Always make sure the code can work as expected
- Use `npm run check` after finished making changes
- Use `npm run format` when you intentionally want auto-fixes

## Svelte/frontend maintainability
- Prefer Svelte 5 event attributes (`onclick`, `oninput`, etc.) consistently in this codebase
- For non-button interactive elements (`role="button"`), support both Enter and Space keyboard activation
- Always set `type="button"` for buttons that are not form submits
- Avoid blocking browser `alert()` for routine UX feedback; prefer inline or toast-style messaging
- Keep production console noise low; gate informational logs behind `import.meta.env.DEV`

## Other
- I will make manual changes sometimes, so do not change it back
- Update README.md when necessary
- If there is anything not clear about my instruction, ask clarification questions first
