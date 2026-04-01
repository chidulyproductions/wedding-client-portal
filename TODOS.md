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
