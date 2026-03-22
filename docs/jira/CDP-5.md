# CDP-5: Platform Detection + Embed Player + oEmbed Proxy

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-2](CDP-2.md)
**Plan ref:** [Phase 2, tasks 6-7](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Implement URL platform detection (Spotify, YouTube, SoundCloud, unknown), build the `embed-player` component with platform-appropriate iframes, and create the server-side oEmbed proxy for SoundCloud CORS.

## Acceptance Criteria
- [ ] `src/lib/oembed.ts` detects platform from URL: Spotify, YouTube, SoundCloud, or unknown
- [ ] `embed-player.tsx` renders platform-appropriate iframe:
  - Spotify track: 152px height embed
  - Spotify playlist: 380px height embed
  - YouTube: standard 16:9 embed
  - SoundCloud: widget via oEmbed HTML
  - Unknown URL: shows manual title input field
- [ ] `/api/oembed-proxy/route.ts` proxies SoundCloud oEmbed requests server-side (fixes CORS)
- [ ] oEmbed proxy validates URL is a SoundCloud domain before proxying
- [ ] oEmbed proxy returns error for non-SoundCloud URLs
- [ ] Embeds are 100% width, responsive
- [ ] Song title resolved via oEmbed `author_name` where available (format: "Artist - Song Title")
- [ ] Embed iframe has appropriate sandbox attributes

## Technical Notes
- SoundCloud oEmbed endpoint blocks client-side requests — must proxy server-side
- Only known platforms (Spotify/YouTube/SoundCloud) get iframe `src` attributes (security)
- See [Security Notes](../plans/wedding-portal-rebuild.md#security-notes-ceo-review)
