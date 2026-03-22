# CDP-16: Admin: Activity Feed (last updated, per-client log)

**Type:** Task
**Priority:** P2
**Phase:** 4 — Admin Dashboard
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-15](CDP-15.md)
**Plan ref:** [Phase 4, task 24](../plans/wedding-portal-rebuild.md#phase-4-admin-dashboard)

## Summary
Build the activity feed showing last-updated timestamps per client and a per-client activity detail log.

## Acceptance Criteria
- [ ] "Last activity: 2h ago" displayed per client in the table/card
- [ ] Relative time formatting (just now, 5m ago, 2h ago, yesterday, Mar 15)
- [ ] Click on activity timestamp → expands to show per-client activity log
- [ ] Activity log: lists recent selection changes with timestamps
- [ ] Activity data derived from `wedding_selections.updated_at` timestamps
- [ ] Clients with recent activity (< 24h) highlighted or sorted to top
- [ ] Empty activity: "No activity yet"
