# CDP-10: Supabase Realtime Subscriptions (live partner updates)

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-6](CDP-6.md)
**Plan ref:** [Phase 2, task 13](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Implement Supabase Realtime subscriptions so both partners see each other's changes live without refreshing. Include visual feedback on remote changes and connection status handling.

## Acceptance Criteria
- [ ] Subscribe to `wedding_selections` changes filtered by `client_key`
- [ ] When partner saves a selection: local state updates immediately (no refresh needed)
- [ ] Visual flash (300ms ease) highlights the section that was updated remotely
- [ ] Flash uses `--blush` color to distinguish from local saves
- [ ] "Reconnecting..." yellow banner appears when WebSocket connection drops
- [ ] Banner dismisses automatically when connection restores
- [ ] Conflict resolution: last-write-wins (no merge logic needed at this scale)
- [ ] Subscription cleans up on component unmount (no memory leaks)
- [ ] Brochure updates in real-time as partner makes selections
- [ ] Progress ring updates in real-time

## Technical Notes
- Supabase Realtime filters: `filter=client_key=eq.{key}`
- Last-write-wins is appropriate for <100 concurrent users (wedding portal scale)
- See [Key Decisions](../plans/wedding-portal-rebuild.md#key-decisions-from-reviews)
