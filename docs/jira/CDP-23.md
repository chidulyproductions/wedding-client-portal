# CDP-23: Post-Deploy: Decommission Original Site

**Type:** Task
**Priority:** P1 (after deploy)
**Phase:** Post-Deploy
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-20](CDP-20.md) (PR1 deployed + validated with 2+ real clients)
**Plan ref:** [Post-Deploy](../plans/wedding-portal-rebuild.md#post-deploy)
**TODO ref:** [TODOS.md](/TODOS.md) — Post-Deploy: Decommission Original Site

## Summary
Clean up the original infrastructure after the new portal is validated in production.

## Acceptance Criteria
- [ ] New portal validated with at least 2 real clients before decommission
- [ ] Remove Netlify functions: `save-selection.js`, `load-selections.js`, `spotify.js`
- [ ] Archive original HTML files: `spotify-selections.html`, `admin.html`, `index.html`
- [ ] Decommission Supabase edge functions: `save-selection`, `load-selections`
- [ ] Update DNS if applicable
- [ ] Remove `netlify.toml`
- [ ] Verify no clients are still using old portal URLs

## Technical Notes
- Both sites hit the same Supabase DB — running in parallel during migration is safe
- Leaving both live long-term risks confusion and stale behavior
