# CDP-7: Announcement, Custom Moments, Sample Playlists, Notes

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-4](CDP-4.md), [CDP-6](CDP-6.md)
**Plan ref:** [Phase 2, task 9](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Build the announcement section (dark card), custom moments (add/remove with dynamic naming), sample playlists (collapsed by default), and additional notes sections.

## Acceptance Criteria
- [ ] Announcement section: dark card variant, text input for "Announcing as" name
- [ ] "Announcing as" line in brochure updates live when announcement is saved
- [ ] Custom moments: "+ Add Custom Moment" button at bottom of sections
- [ ] Custom moment creation: name input → new section card appears with that name
- [ ] Custom moment marker: saves with `song_title: '__custom_def__'`, label stored in `notes`
- [ ] Custom moments persist across page reload
- [ ] Custom moments can be removed (tombstone deletion)
- [ ] Sample playlists section: collapsed by default, expandable, playlist-type embed
- [ ] Additional notes section: free-text textarea, saves to DB
- [ ] All sections use the `selection-card` component (from CDP-4)

## Technical Notes
- Custom moment marker convention: `song_title: '__custom_def__'` with label in `notes` field
- See [Key Behavioral Notes](../plans/wedding-portal-rebuild.md#key-behavioral-notes)
