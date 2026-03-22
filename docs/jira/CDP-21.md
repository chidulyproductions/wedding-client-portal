# CDP-21: Spotify Folder Export (PR2: OAuth + playlist creation)

**Type:** Task
**Priority:** P2
**Phase:** PR2
**Effort:** L
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-20](CDP-20.md)
**Blocked by:** Spotify developer app approval
**Plan ref:** [PR2](../plans/wedding-portal-rebuild.md#pr2-spotify-export--email-notifications-follow-up)
**TODO ref:** [TODOS.md](/TODOS.md) — PR2: Spotify Folder Export

## Summary
Export the wedding music program to Spotify. Each wedding moment becomes a Spotify playlist with the selected song. Build an admin page with OAuth connect button and per-client export action.

## Acceptance Criteria
- [ ] Spotify developer app registered and approved
- [ ] DJ authenticates Spotify account via OAuth flow (one-time)
- [ ] `/admin/spotify-export` page with per-client export button
- [ ] Export creates a Spotify folder with one playlist per wedding moment
- [ ] Each playlist contains the selected song for that moment
- [ ] Progress indicator during export
- [ ] Error handling: expired token → re-auth prompt, API rate limits → retry with backoff
- [ ] Only exports moments that have Spotify URLs (skips YouTube/SoundCloud/empty)

## Environment Variables
```
SPOTIFY_CLIENT_ID=<client id>
SPOTIFY_CLIENT_SECRET=<client secret>
```
