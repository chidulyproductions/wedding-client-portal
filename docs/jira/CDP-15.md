# CDP-15: Admin: Client Table + Progress % + Mobile Card Layout

**Type:** Task
**Priority:** P1
**Phase:** 4 — Admin Dashboard
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-13](CDP-13.md)
**Plan ref:** [Phase 4, task 23](../plans/wedding-portal-rebuild.md#phase-4-admin-dashboard)

## Summary
Build the clients table on the admin dashboard showing all clients with status, progress percentage, and responsive mobile card layout.

## Acceptance Criteria
- [ ] Desktop: full table with columns — Name, Date, Email, Status (Active/Locked), Progress %, Portal Link, Actions
- [ ] Mobile: card layout per client (not squished table)
- [ ] Progress % calculated from selection count vs 14 default moments
- [ ] Status badge: "Active" (green) or "Locked" (muted)
- [ ] Portal link: clickable, opens in new tab
- [ ] Table sortable by name, date, progress (default: date ascending for upcoming weddings)
- [ ] Empty state: "No clients yet. Add your first client above."
- [ ] Horizontal scroll on mobile for table (if table variant preferred over cards on medium screens)
- [ ] Uses admin dark theme colors

## Technical Notes
- Progress % = count of non-null, non-tombstone selections / 14
- Admin table: horizontal scroll on mobile, full table on desktop (from DESIGN.md)
