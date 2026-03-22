# CDP-14: Admin: Add New Client Form

**Type:** Task
**Priority:** P1
**Phase:** 4 — Admin Dashboard
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-13](CDP-13.md)
**Plan ref:** [Phase 4, task 22](../plans/wedding-portal-rebuild.md#phase-4-admin-dashboard)

## Summary
Build the "Add New Client" form on the admin dashboard that creates a new client record and generates their portal link.

## Acceptance Criteria
- [ ] Form fields: Couple Name, Wedding Date (date picker), Email
- [ ] Inserts row into `clients` table via Supabase (service role)
- [ ] Generates portal link using client key derivation
- [ ] Portal link shown/copyable after creation
- [ ] Validation: all fields required, email format check, date must be in future
- [ ] Success: toast + new client appears in table
- [ ] Error: toast with message (e.g., "Client already exists")
- [ ] Uses admin dark theme
