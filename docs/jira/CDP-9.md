# CDP-9: Dark Mode Toggle (warm dark palette)

**Type:** Task
**Priority:** P2
**Phase:** 2 — Client Selection Page
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-2](CDP-2.md)
**Plan ref:** [Phase 2, task 12](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Implement dark mode toggle on the client selection portal with the warm dark palette from DESIGN.md, persisted in localStorage.

## Acceptance Criteria
- [ ] `dark-mode-toggle.tsx` component in header (top-right area)
- [ ] Toggle switches between light and dark palettes defined in DESIGN.md
- [ ] Dark mode colors: warm tones (NOT pure black) — `--background: #1a1218`, `--card: #231e26`
- [ ] Full theme transition: 200ms ease on all color properties
- [ ] Preference persisted in `localStorage` (survives page reload)
- [ ] Respects `prefers-color-scheme` system setting on first visit (no localStorage yet)
- [ ] Tailwind `dark:` variant used throughout all components
- [ ] All text maintains WCAG AA contrast ratio (4.5:1) in dark mode
- [ ] Embeds (iframes) are not affected by dark mode toggle

## Design Tokens
- Dark bg: `#1a1218` (warm, NOT pure black)
- Dark card: `#231e26`
- Dark text: `#f5f0ea` (warm cream)
- Dark accent: `#c49050` (gold, brightened)
- Dark blush: `#d0889a` (rose, brightened)
- See [DESIGN.md](/DESIGN.md) — Client Portal Dark Mode section
