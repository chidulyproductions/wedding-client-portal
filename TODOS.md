# TODOS

## PR2: Spotify Folder Export
**Priority:** P2 | **Effort:** L (human: ~1 week / CC: ~45 min)
**Depends on:** PR1 core rebuild complete + Spotify developer app approved

Export the wedding music program to Spotify. Each wedding moment becomes a Spotify playlist with the selected song. Requires Spotify developer app registration, OAuth user authorization flow, and Spotify Web API playlist creation calls. Build an /admin/spotify-export page with OAuth connect button and per-client export action. The DJ authenticates their Spotify account once, then can export any client's program.

**Context:** This was accepted in the CEO review (Expansion #10) but split from PR1 because Spotify developer app approval may not be instant.

## PR2: Email Notifications on Client Updates
**Priority:** P2 | **Effort:** M (human: ~3 days / CC: ~20 min)
**Depends on:** PR1 core rebuild complete + email service account (Resend free tier recommended)

Notify the DJ when a client saves or updates a music selection. Implementation options: (a) Supabase database webhook → Resend API, or (b) Supabase Edge Function trigger on wedding_selections INSERT/UPDATE. Should batch/debounce notifications to avoid spamming (e.g., one email per client per 15 minutes summarizing changes).

**Context:** This was accepted in the CEO review (Expansion #9). Split from PR1 because it requires email service integration.

## Post-Deploy: Decommission Original Site
**Priority:** P1 (after PR1 deployed) | **Effort:** S (human: ~2 hours / CC: ~10 min)
**Depends on:** PR1 deployed to Vercel + validated with at least 2 real clients

Clean up the original infrastructure: remove Netlify functions (save-selection.js, load-selections.js, spotify.js), archive original HTML files, decommission Supabase edge functions (save-selection, load-selections), update DNS if applicable, and remove netlify.toml.

**Context:** Both sites hit the same Supabase DB. Running them in parallel during migration is safe, but leaving both live long-term risks confusion and stale behavior.
