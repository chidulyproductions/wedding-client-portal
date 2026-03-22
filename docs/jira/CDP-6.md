# CDP-6: Save/Load/Delete Hook + Error Handling (toast + retry)

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-2](CDP-2.md)
**Plan ref:** [Phase 2, task 8](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Build the `use-selections` custom hook for all selection CRUD operations via Supabase SDK, with toast notifications and retry on error. Build the toast notification component.

## Acceptance Criteria
- [ ] `src/hooks/use-selections.ts` provides: `loadSelections()`, `saveSelection()`, `clearSelection()`, `deleteSelection()`
- [ ] Save uses upsert with `ON CONFLICT (client_key, section_id)` merge-duplicates
- [ ] Load deduplicates by keeping latest `updated_at` per `(client_key, section_id)`
- [ ] Delete saves tombstone row (null `spotify_url`)
- [ ] `toast.tsx` component: bottom-right, stacked, slide-up entrance
  - Success: gold accent border, auto-dismiss 5s
  - Error: blush/red accent border, persists until dismissed
- [ ] Save failure: toast + automatic retry (3x with exponential backoff) + "unsaved changes" indicator
- [ ] Load failure: error state with [Retry] button (not blank page)
- [ ] Double-click protection: debounce or disable button during save
- [ ] All errors logged with context (what was being attempted, for which client_key/section_id)

## Technical Notes
- Upsert pattern: `ON CONFLICT (client_key, section_id)` — see [Key Behavioral Notes](../plans/wedding-portal-rebuild.md#key-behavioral-notes)
- Tombstone rows: null `spotify_url` = section was deleted
- Notes stored as separate rows with `{sectionId}-notes` section_id convention
- See [Error Handling](../plans/wedding-portal-rebuild.md#error-handling-eng-review)
