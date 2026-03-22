# CDP-17: Admin: Send Magic Link, Edit Email, Lock/Unlock, Copy Link

**Type:** Task
**Priority:** P1
**Phase:** 4 — Admin Dashboard
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-15](CDP-15.md)
**Plan ref:** [Phase 4, tasks 25-26](../plans/wedding-portal-rebuild.md#phase-4-admin-dashboard)

## Summary
Build admin actions: send magic link (with additional recipients), inline email editing, lock/unlock toggle, and copy portal link.

## Acceptance Criteria
- [ ] **Send Magic Link**: button opens modal with pre-filled primary email + field for additional recipients
- [ ] Magic link sent via `/api/send-magic-link` route (uses service role key, server-only)
- [ ] Modal shows success/error state after sending
- [ ] "Resend" button available (email delivery is fire-and-forget)
- [ ] **Edit Email**: inline editing in table row, saves on blur or Enter
- [ ] Email validation before save
- [ ] **Lock/Unlock**: toggle switch per client, updates `clients.locked`
- [ ] Lock state immediately reflected (client portal shows lock overlay)
- [ ] **Copy Link**: copies portal URL to clipboard with toast confirmation
- [ ] All actions require authenticated admin session

## Technical Notes
- `/api/send-magic-link` uses `SUPABASE_SERVICE_ROLE_KEY` — never exposed to client
- See [Security Notes](../plans/wedding-portal-rebuild.md#security-notes-ceo-review)
