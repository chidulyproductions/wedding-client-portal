# CDP-22: Email Notifications (PR2: Supabase webhook -> Resend)

**Type:** Task
**Priority:** P2
**Phase:** PR2
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-20](CDP-20.md)
**Blocked by:** Resend email service account setup
**Plan ref:** [PR2](../plans/wedding-portal-rebuild.md#pr2-spotify-export--email-notifications-follow-up)
**TODO ref:** [TODOS.md](/TODOS.md) — PR2: Email Notifications on Client Updates

## Summary
Notify the DJ when a client saves or updates a music selection. Batch/debounce notifications to avoid spamming.

## Acceptance Criteria
- [ ] Supabase database webhook or Edge Function triggers on `wedding_selections` INSERT/UPDATE
- [ ] Email sent via Resend API to DJ's email
- [ ] Debounced: one email per client per 15 minutes summarizing all changes
- [ ] Email includes: client name, which moments were updated, link to admin portal
- [ ] Email template matches Chi Duly branding
- [ ] Error handling: email delivery failure logged but doesn't block client saves

## Environment Variables
```
RESEND_API_KEY=<api key>
```
