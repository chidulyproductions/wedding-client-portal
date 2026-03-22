# CDP-13: Admin: Login Screen (Supabase auth)

**Type:** Task
**Priority:** P1
**Phase:** 4 — Admin Dashboard
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-2](CDP-2.md)
**Plan ref:** [Phase 4, task 21](../plans/wedding-portal-rebuild.md#phase-4-admin-dashboard)

## Summary
Build the admin login screen using Supabase email/password authentication.

## Acceptance Criteria
- [ ] Login form: email + password fields, "Sign In" button
- [ ] Authenticates against Supabase Auth (email/password)
- [ ] On success: redirects to admin dashboard
- [ ] On failure: error message displayed inline (not toast)
- [ ] Uses admin dark theme colors from DESIGN.md
- [ ] Keyboard accessible: Tab through fields, Enter to submit
- [ ] Loading state on submit button (prevent double-click)
- [ ] Session persists across page reload (Supabase session handling)

## Design Tokens
- Admin bg: `#0e0c0f` (deep purple-black)
- Admin card: `#1a1720`
- Admin text: `#f0ecf5` (light lavender white)
- See [DESIGN.md](/DESIGN.md) — Admin Dashboard Dark Theme
