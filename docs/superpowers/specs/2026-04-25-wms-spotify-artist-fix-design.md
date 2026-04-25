# WMS Spotify Artist Fix — Design Spec

**Date:** 2026-04-25
**Project:** Chi Duly Productions — Wedding Music Site (WMS)
**Status:** Approved (pending user review of this written spec)
**Jira:** WED-XX (to be created at start of implementation)

---

## Overview

The WMS client portal (`spotify-selections.html`) silently fails to capture the `artist` field on every Spotify-sourced selection. 30 of 31 Spotify rows in `wedding_selections` have `artist = null`. This spec describes the fix: restore artist capture in the form, and one-shot backfill the existing 30 null rows.

---

## Problem & Root Cause

**Symptom:** every Spotify selection saves with `artist = null` in Supabase. Visible only when downstream code (e.g. Serato crate building) tries to use the artist field.

**Root cause:** commit `838a87e` (2026-03-18, "Fix: replace broken Spotify edge function with direct oEmbed API") replaced a working Supabase Edge Function path with a direct call to `open.spotify.com/oembed`. The original Edge Function used the Spotify Web API (client-credentials OAuth) and returned both title and artist. The replacement oEmbed endpoint returns title only — Spotify's public oEmbed response does not include `author_name` (verified via live curl on 2026-04-25).

The frontend code at `spotify-selections.html:1962` does `const artist = data.author_name || ''`, which silently produces an empty string for every Spotify URL. The save path at `netlify/functions/save-selection.js:44` then runs `artist: artist || null`, coercing empty strings to `null` before insert.

**Why it wasn't caught:**
- The Spotify embed iframe on the client portal renders Spotify's own metadata, so the page visually shows "Title — Artist" regardless of what's in our database. The failure is invisible at the UI layer.
- The brochure list shows title only (no artist column), so the missing artist doesn't render as a gap.
- No automated tests exist for this flow.

**Why a Web API fix is correct:** Spotify's Web API track endpoint (`/v1/tracks/{id}`) returns the full artist list for any track, including covers and remixes (e.g. Brooklyn Duo's cover of Landslide returns artist = "Brooklyn Duo", not "Fleetwood Mac"). This restores the pre-`838a87e` behavior.

---

## Architecture

### Data Flow (after fix)

```
Client pastes URL into a section
  ↓
detectPlatform(url) → 'spotify' | 'youtube' | 'soundcloud'
  ↓
─────────────────────────────────────────────────────────────
  spotify    → POST /.netlify/functions/spotify {spotifyUrl}
             → Spotify Web API (client-credentials)
             → returns {title, artist}

  youtube    → GET youtube.com/oembed?url=…  (unchanged)
             → returns {title, author_name}

  soundcloud → GET soundcloud.com/oembed?url=…  (unchanged)
             → returns {title, author_name}
─────────────────────────────────────────────────────────────
  ↓
updateProgram(sectionId, title, artist, url)
  ↓
upsert wedding_selections {client_key, section_id, song_title, artist, spotify_url}
```

### Components

#### 1. `netlify/functions/spotify.js` — already exists, no change

Created 2026-03-08 (`4cb9a92 Create spotify.js`), never wired up. Already does:
- Accepts `POST { spotifyUrl }`
- Validates URL pattern `spotify.com/(track|playlist|album)/{id}`
- Fetches a Spotify client-credentials access token from `accounts.spotify.com/api/token`
- Calls `api.spotify.com/v1/tracks/{id}` (or playlist/album)
- Returns `{ type, title, artist }` for tracks (artist = `info.artists.map(a => a.name).join(', ')`)
- CORS: `Access-Control-Allow-Origin: *`

Implementation will spot-check this for robustness during the work but plan no code changes.

#### 2. `spotify-selections.html` — modify `fetchSongInfo()`

Current code (lines 1946–1968) routes all platforms through oEmbed. New code branches on platform: Spotify uses the Netlify function via Web API, YouTube/SoundCloud unchanged.

Spotify path includes a graceful fallback to oEmbed if the function call fails — preserves title capture even when the Web API is unreachable. The `html` field returned by `fetchSongInfo` is unused downstream and will be dropped from the return value.

`updateProgram()` signature is already `(sectionId, title, artist, url)` — no signature change. `save-selection.js` (Netlify function) already accepts `artist` — no backend change.

#### 3. `scripts/backfill-spotify-artist.js` — new file

One-shot Node script (~80 lines, native `fetch`, zero npm dependencies). Reads from `.env`:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY` (service-role)
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`

Behavior:
1. Validate env vars (fail fast).
2. Fetch a single Spotify client-credentials token (reused for all rows).
3. Query Supabase REST: `wedding_selections WHERE spotify_url IS NOT NULL AND spotify_url LIKE '%spotify.com/track/%' AND artist IS NULL`.
4. For each row: extract track ID → call Web API → PATCH the row by UUID with the artist value.
5. Print per-row log line. Print summary (`N updated, M skipped, K failed`).

Properties:
- **Idempotent.** Filter excludes rows that already have an artist. Re-running is a no-op.
- **`--dry-run` flag.** Prints all proposed updates without writing.
- **Resumable.** Each row is updated independently; killing the script mid-run leaves all completed rows fixed and unfinished rows untouched.
- **Skips non-track URLs.** Playlists/albums in the table (none currently expected, but handled defensively).
- **Won't overwrite hand-patched rows.** The Anniversary Dance row (artist = "Alan Jackson") is excluded by the WHERE clause.

---

## Failure Modes

| Failure | Frontend behavior | Backfill behavior |
|---|---|---|
| Spotify token request fails (5xx) | Falls back to oEmbed → title captured, artist empty | Logs, exits with non-zero |
| Track 404 (deleted/private) | Falls back to oEmbed → title captured, artist empty | Logs the row, skips, continues |
| Rate limited (429) | Falls back to oEmbed → title captured, artist empty | Logs, exits non-zero (re-run picks up where it left off) |
| Malformed Spotify URL | Function returns 400 → fallback path | Filtered out by `LIKE '%spotify.com/track/%'` |
| Function cold start (~1–2s delay) | Acceptable — UX shows brief loading state | N/A |
| Backfill killed mid-run | N/A | Re-run picks up unfinished rows (idempotent filter) |

---

## Test & Rollout Plan

### Pre-flight

1. Create Jira ticket in `WED` project: *"Fix WMS Spotify selections not capturing artist field"*.
2. Move ticket to **In Progress**.
3. Verify Netlify env: `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` both set in production. (`.env.example` only lists `SPOTIFY_CLIENT_SECRET` — the function reads both.)
4. Curl-test the orphan function directly against production:
   ```
   curl -X POST https://<wms-domain>/.netlify/functions/spotify \
     -H 'Content-Type: application/json' \
     -d '{"spotifyUrl":"https://open.spotify.com/track/4cDDW81n1BtUfmbulXzrl8"}'
   ```
   Expected: `{"type":"track","title":"Landslide","artist":"Brooklyn Duo"}`. If 404, the function will deploy with the next push.

### Implementation

5. Modify `fetchSongInfo()` in `spotify-selections.html` per the design above.
6. Add `scripts/backfill-spotify-artist.js`.

### Verification

7. **Manual regression test (documented in Jira ticket):**
   - Load `spotify-selections.html?client=<test_key>` in a browser
   - Paste a known Spotify track URL into any section
   - Wait for the section to render the iframe
   - Query Supabase REST for that row → assert `artist` is non-null and matches the actual track artist
8. **Backfill dry-run:**
   ```
   node scripts/backfill-spotify-artist.js --dry-run
   ```
   Eyeball the 30 expected updates. Confirm no surprises.
9. **Backfill apply:**
   ```
   node scripts/backfill-spotify-artist.js
   ```
10. Verify Supabase: count rows where `spotify_url IS NOT NULL AND artist IS NULL` should be 0.

### Close out

11. Move Jira ticket to **Done**.
12. Add separate `jira_add_comment` call (transition's comment param silently fails) describing what shipped, the audit trail of the original `838a87e` regression, and the count of rows backfilled.

### Git discipline

Per the project's global rules: no commits until the user explicitly asks. Single push when frontend + script are both verified working. No deploys to prod without explicit approval.

---

## Out of Scope (YAGNI)

These are real ideas that came up but are deliberately not part of this fix:

- **Unifying YouTube/SoundCloud through the same function.** Their oEmbed responses include `author_name` and currently work. Channel-name-as-artist is imperfect but not broken.
- **Parsing "Artist - Title" from YouTube/SoundCloud title fields.** Fragile; lots of false positives. Defer until it's a real problem.
- **Validation pass that re-queries Spotify for non-null rows** (catching Anniversary-Dance-style metadata drift). Worth doing later as a separate audit job; out of scope here.
- **Adding a Playwright test suite** for the WMS form flow. Real automation test infrastructure is its own project, ~2hrs of setup minimum. The manual test plan in the Jira ticket suffices for this fix.
- **Pre-warming the Netlify function** to avoid cold-start delay. Cost not worth the ~1s improvement.
- **Admin UI for re-running backfills.** This is a one-time cleanup. If a similar issue recurs, the script in `scripts/` is reusable as-is.

---

## Open Items at Implementation Time

1. Confirm Netlify production domain (`<wms-domain>`) for the curl test — find from `netlify.toml`, Netlify dashboard, or by asking.
2. Confirm `SPOTIFY_CLIENT_ID` is set in Netlify env (the source-tree `.env.example` doesn't list it — possible omission).
3. Decide whether the backfill script should also normalize the `updated_at` field on touched rows (defaults to "no" — leave audit trail of original creation date intact, the artist write happens via PATCH which may or may not update the timestamp depending on Supabase column defaults).
