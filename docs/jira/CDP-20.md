# CDP-20: Full Test Suite (unit + component + E2E)

**Type:** Task
**Priority:** P1
**Phase:** 6 — Testing
**Effort:** L
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-7](CDP-7.md), [CDP-17](CDP-17.md)
**Plan ref:** [Phase 6, tasks 31-33](../plans/wedding-portal-rebuild.md#phase-6-testing)

## Summary
Implement the full test pyramid: Vitest unit tests, React Testing Library component tests, and Playwright E2E tests covering all critical paths.

## Acceptance Criteria

### Unit Tests (Vitest)
- [ ] Client key derivation: standard names, special characters (& in names), edge cases
- [ ] Platform detection: Spotify track/playlist, YouTube, SoundCloud, unknown URL, empty string, nil
- [ ] oEmbed parsing: valid response, malformed JSON, empty response, timeout
- [ ] Section config: all 15 default sections present with correct types

### Component Tests (React Testing Library)
- [ ] Selection card: renders 3 types, input interaction, save callback, clear callback
- [ ] Brochure: renders all 3 modes, progress ring updates, dot-leader pattern
- [ ] Progress ring: 0/14, partial, 14/14 (celebration trigger)
- [ ] Embed player: renders correct iframe per platform, unknown URL fallback
- [ ] Dark mode toggle: switches theme, persists in localStorage
- [ ] Toast: renders success/error variants, auto-dismiss timing

### E2E Tests (Playwright)
- [ ] Full selection flow: open portal → paste Spotify URL → embed shows → "Song Saved" → refresh → persists
- [ ] Admin CRUD: login → create client → copy link → open in new tab → verify → lock → verify overlay
- [ ] Shareable program: make 3 selections → visit /program/[key] → all 3 songs shown
- [ ] Custom moment: add → name → paste URL → refresh → persists
- [ ] Error recovery: paste URL → kill network → error toast → restore → retry succeeds

## Technical Notes
- Full test pyramid: many unit, fewer component, few E2E
- See [Test Strategy](../plans/wedding-portal-rebuild.md#key-decisions-from-reviews)
