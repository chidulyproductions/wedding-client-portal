# TODOS

## Client Portal: Admin Dashboard Redesign
**Priority:** P3 | **Effort:** L
**Depends on:** nothing (the client-portal aesthetic overhaul has landed)

Bring admin.html into the same aesthetic family as the redesigned client portal. Target audience: other wedding DJs if/when this becomes a product.

## Remove the Legacy Netlify Functions
**Priority:** P3 | **Effort:** S (human: ~30 min / CC: ~5 min)
**Depends on:** Chris disconnecting the Netlify site in the Netlify dashboard

`netlify/functions/load-selections.js` and `save-selection.js` are old copies that no page calls. The client page uses the **Supabase** functions of the same names, which must stay. A Netlify site is still connected to this repo and redeploys on every push, but clients don't use it. Once that site is disconnected, delete `netlify/` and `netlify.toml` and drop the Netlify references in `CLAUDE.md`.

**Context:** This entry used to be "Decommission Original Site". It assumed a Next.js/Vercel rebuild (`REBUILD-PLAN.md`) that never shipped, and it listed the Supabase `load-selections` / `save-selection` functions for removal. Those are now the live load and save path, so removing them would break the portal. Rewritten 2026-11-04.

## Admin: Per-Client Uploaded Audio Listing
**Priority:** P3 | **Effort:** S
**Depends on:** nothing (custom audio upload has shipped)

Add an "Uploaded audio" list to each client in admin.html — every section with an `audio_url`, labelled by moment, with download links — so every custom edit for one wedding can be pulled in one pass instead of scrolling the client portal. Deferred from the custom-audio-upload design (2026-08-05); portal-level download was enough to ship.

## Storage: Scope or Cap client-audio Uploads
**Priority:** P3 | **Effort:** S–M
**Depends on:** nothing

The `client-audio` bucket accepts anon uploads (the anon key is public). Each file is capped at 25 MB, but nothing caps the total against the **500 MB budget** (Chris's call, 2026-11-04). The daily `storage-watch` workflow (2026-11-05) now reports usage and unreferenced files, and fails at 400 MB, so overuse is noticed but not prevented. Remaining options, if abuse ever shows up in that report:
- scope uploads to a client-key-prefixed path, so abuse can be traced and rate-limited;
- a hard cap through a storage policy, which needs a migration.

## Client Portal: Lock Overlay Palette
**Priority:** P3 | **Effort:** S (CC: ~5 min)
**Depends on:** nothing

`#locked-overlay` uses inline pre-overhaul colours (`#a07840` gold, `#1a1218`, `#7a7275`, `#b06878`) on a cream `rgba(245,240,234,0.97)` backdrop. Its fonts were aligned with the overhaul (2026-11-03) but its colours were not. Swap them for the `:root` tokens (`--blush`, `--charcoal`, `--muted`) and check the result against the dark page behind it.
