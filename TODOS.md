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

## Client Portal: Print Styles
**Priority:** P3 | **Effort:** S (human: ~2 hours / CC: ~5 min)
**Depends on:** Aesthetic overhaul complete

Add `@media print` styles so clients can print the wedding program. Current glassmorphism and gradient backgrounds won't render on paper. Black text on white, clean Playfair Display serif, no animations.

## Client Portal: Save/Loading State Styling
**Priority:** P2 | **Effort:** S (human: ~1 hour / CC: ~10 min)
**Depends on:** Aesthetic overhaul complete

Design and add explicit styling for intermediate save states (saving in-progress, network error) to the saved pill component. Current spec only covers the "saved" success state. Error state needs distinct styling — not rose gold, something clearly different.

## Client Portal: Lock Overlay Font Alignment
**Priority:** P3 | **Effort:** S (human: ~30 min / CC: ~5 min)
**Depends on:** Aesthetic overhaul complete

The lock overlay uses inline `style=""` with Bodoni Moda/Raleway. After the aesthetic overhaul, the overlay will use old fonts while the rest of the page uses Playfair Display/DM Sans. Update inline styles on `#locked-overlay` to match the new font stack.

## Client Portal: Progress Indicator
**Priority:** P3 | **Effort:** S
**Depends on:** Aesthetic overhaul complete

Add a progress indicator to the client portal showing how many moments have been selected out of the total. Style TBD — could be a ring, bar, or counter. Should update live as clients make selections.

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

## Check `save-selection` for silent failures
**Priority:** P2 | **Effort:** S (human: ~1 hour / CC: ~15 min)
**Deferred because:** found 2026-10-08 while documenting the functions; out of scope for a docs change.

The deployed `save-selection` function posts to `wedding_selections` with
`Prefer: resolution=merge-duplicates` but no `?on_conflict=client_key,section_id`, and it never
checks the response before returning `{ success: true }`. `CLAUDE.md` already notes that a REST
upsert without `on_conflict` 409s on the unique constraint. If that applies here, re-saving an
existing custom-moment definition fails without the client page knowing. **Unverified:** test by
saving the same custom moment twice against a throwaway `client_key` and reading the row back.

## Merge or close PR #36 (8 commits not live)
**Priority:** P2 | **Effort:** S
**Deferred because:** found 2026-10-08; these are unfinished feature decisions, not a docs matter.

Branch `fix/brochure-redundancy-and-date` holds 8 commits from 2026-08-15 to 08-24 that are not
on `main`, so clients do not see them: the brochure credit and date fixes, the Recessional rename,
the Grand Entrance sample card, custom moments anchoring into the program run, and per-client
section reordering. Six of the eight had never been pushed until 2026-10-08. PR #36 is still open.

## Retire the legacy Netlify copy
**Priority:** P3 | **Effort:** S
**Deferred because:** found 2026-10-08; harmless today.

Netlify site `clinquant-starlight-9bcdfa` is still connected to this repo and redeploys a second
public copy of the site on every push, along with the unused `netlify/functions/`. Nothing calls
it. Disconnect the site in Netlify, then delete `netlify/` and `netlify.toml`.

## Decide whether this repo should stay public
**Priority:** P2 | **Effort:** S
**Deferred because:** found 2026-10-08; a policy call for Chris.

The repo is public and GitHub Pages serves every file, including `CLAUDE.md`, which documents
that RLS is off on `wedding_selections` and that anyone can upload to the `client-audio` bucket.
GitHub Pages on a private repo needs a paid plan; the alternative is moving hosting to Netlify
(already connected) and making the repo private.

