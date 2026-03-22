# CDP-18: Admin: Delete Client (two-step, atomic)

**Type:** Task
**Priority:** P1
**Phase:** 4 — Admin Dashboard
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-15](CDP-15.md)
**Plan ref:** [Phase 4, task 27](../plans/wedding-portal-rebuild.md#phase-4-admin-dashboard)

## Summary
Implement client deletion with two-step confirmation and atomic deletion of both the client record and all their selections.

## Acceptance Criteria
- [ ] Delete button: first click shows "Are you sure? This deletes all selections."
- [ ] Second click (confirm): deletes client + all `wedding_selections` for that `client_key`
- [ ] Deletion is atomic: either both client and selections are deleted, or neither (Supabase RPC or rollback)
- [ ] On partial failure: rollback with error toast explaining what happened
- [ ] Confirm dialog auto-dismisses after 5s if no second click (reverts to normal delete button)
- [ ] Client removed from table immediately on success
- [ ] Toast confirmation: "Client deleted"

## Technical Notes
- Atomicity via Supabase RPC or sequential delete with rollback on partial failure
- See [Error Handling](../plans/wedding-portal-rebuild.md#error-handling-eng-review) — point 4
