# CDP-4: Selection Card Component (reusable, 3 types)

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-2](CDP-2.md)
**Plan ref:** [Phase 2, task 5](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Build the reusable `selection-card` component supporting song link, playlist link, and text input types. Create section config data array for all 15 default wedding moments.

## Acceptance Criteria
- [ ] `selection-card.tsx` renders 3 types: Song Link (Spotify/YouTube/SoundCloud), Playlist Link, Text Input
- [ ] Section config data array with all 15 moments (Guest Seating, Wedding Party Walk, Bride Walk, The Kiss, Ceremony Exit, Grand Entrance, First Dance, Father-Daughter Dance, Mother-Son Dance, Bouquet Toss, Last Dance, Cake Cutting, Anniversary Dance, Dollar Dance, Hora/Special)
- [ ] Each card: white card on cream bg, 3px top accent border (gold standard, blush special)
- [ ] Section header: title (uppercase, tracked) + type badge (Song Link / Playlist Link)
- [ ] Input row: text input + "upload" button (blush color)
- [ ] "✓ Song Saved" pill fades in on save (200ms ease-out), gold text
- [ ] Clear button appears after selection, muted style
- [ ] Remove button (trash icon) top-right, triggers section hide + undo bar
- [ ] Full-width on mobile, max-width 720px centered on desktop
- [ ] Minimum 44px touch targets on all interactive elements
- [ ] Focus-visible: 2px gold outline

## Design Tokens
- Card background: `--card` (#faf6f1 light, #231e26 dark)
- Top accent: 3px `--accent` (#a07840) or `--blush` (#b06878)
- Section title: Raleway, 0.85rem, 600, uppercase, 0.2em tracking
- Badge: Raleway, 0.7rem, 600, uppercase, 0.2em tracking
- See [DESIGN.md](/DESIGN.md) for full tokens
