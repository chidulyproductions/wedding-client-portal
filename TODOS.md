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

## Client Portal: Admin Dashboard Redesign
**Priority:** P3 | **Effort:** L
**Depends on:** Aesthetic overhaul complete

Bring admin.html into the same aesthetic family as the redesigned client portal. Target audience: other wedding DJs if/when this becomes a product.

## Post-Deploy: Decommission Original Site
**Priority:** P1 (after PR1 deployed) | **Effort:** S (human: ~2 hours / CC: ~10 min)
**Depends on:** PR1 deployed to Vercel + validated with at least 2 real clients

Clean up the original infrastructure: remove Netlify functions (save-selection.js, load-selections.js, spotify.js), archive original HTML files, decommission Supabase edge functions (save-selection, load-selections), update DNS if applicable, and remove netlify.toml.

**Context:** Both sites hit the same Supabase DB. Running them in parallel during migration is safe, but leaving both live long-term risks confusion and stale behavior.

## Admin: Per-Client Uploaded Audio Listing
**Priority:** P3 | **Effort:** S
**Depends on:** Custom audio upload shipped

Add an "Uploaded audio" list to each client in admin.html — every section with an `audio_url`, labelled by moment, with download links — so every custom edit for one wedding can be pulled in one pass instead of scrolling the client portal. Deferred from the custom-audio-upload design (2026-08-05); portal-level download was enough to ship.

## Storage: Watch the client-audio bucket
**Priority:** P3 | **Effort:** S
**Depends on:** Custom audio upload shipped

The `client-audio` bucket accepts anon uploads (the anon key is public), capped at 25 MB per file but not in total, against a 1 GB free-tier ceiling. No monitoring exists. Worth either a periodic size check or scoping uploads to a client-key-prefixed path so abuse can be traced and rate-limited. Raised in the Task 1 code-quality review.

## Client Portal: Lock Overlay Contact Link Is Broken
**Priority:** P2 | **Effort:** S (CC: ~5 min, once the address is chosen)
**Depends on:** Chris choosing which contact address to show

The last line of `#locked-overlay` renders as "[EMAIL PROTECTED]" and links to `/cdn-cgi/l/email-protection`. That is Cloudflare's email obfuscation, saved into the HTML from a Cloudflare-served copy of the page; GitHub Pages has no `/cdn-cgi/` and no decoder script, so locked couples see a dead link instead of a way to reach the DJ. Found while doing the overlay font alignment (2026-11-03) and left alone because the fix means writing a contact address into a public repo, which is Chris's call. While there, the overlay's colours (`#a07840` gold, `#1a1218`, `#7a7275`, `#b06878`) are still the pre-overhaul palette; only its fonts were aligned.
