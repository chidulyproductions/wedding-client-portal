# CDP-8: Lock Overlay, URL Personalization, Remove/Undo Sections

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-6](CDP-6.md)
**Plan ref:** [Phase 2, tasks 10-11](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Implement the lock overlay for finalized clients, URL-based personalization from query params, and remove/undo section functionality with tombstone saves.

## Acceptance Criteria
- [ ] `use-lock-status.ts` hook checks if client is locked via `clients` table
- [ ] When locked: full-screen overlay saying "Your selections are finalized" — no editing possible
- [ ] Lock overlay is visually elegant (not just a blocking div) — semi-transparent with card message
- [ ] URL personalization: `/selections?name=Sierra+%26+Thad&date=2026-06-15` derives client_key
- [ ] Client key derivation handles special characters (& in names) correctly
- [ ] Remove section: trash button → section visually hides → undo bar appears at top
- [ ] Undo bar: "Section removed. [Undo]" — auto-dismisses after 5s, then tombstone is saved
- [ ] If undo clicked: section restored, selection re-saved
- [ ] If undo expires: tombstone row saved to DB (null `spotify_url`)

## Technical Notes
- Client key regex: `(name + '-' + date).toLowerCase().replace(/[^a-z0-9-]/g, '-')`
- Tombstone rows: null `spotify_url` = section was deleted
- See [Key Behavioral Notes](../plans/wedding-portal-rebuild.md#key-behavioral-notes)
