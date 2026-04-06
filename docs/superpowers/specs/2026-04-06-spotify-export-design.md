# Spotify Export — Design Spec

**Date:** 2026-04-06
**Project:** Chi Duly Productions — Wedding DJ Portal
**Status:** Approved

---

## Overview

A Spotify export feature in the admin dashboard that lets the DJ export any client's wedding music program to Spotify. Each moment in the program becomes a Spotify playlist. The export can be re-triggered any time and updates playlists in place.

---

## Architecture

### New Supabase Edge Functions

**`spotify-auth`**
- Generates the Spotify OAuth authorization URL with required scopes
- Scopes needed: `playlist-modify-private`, `playlist-modify-public`, `playlist-read-private`
- Redirects the DJ to Spotify's login/authorization page
- Triggered by clicking "Connect Spotify" in the admin dashboard

**`spotify-callback`**
- Handles the OAuth redirect from Spotify after authorization
- Exchanges the authorization code for access + refresh tokens
- Stores tokens in `spotify_tokens` table (upsert — one row always)
- Redirects back to the admin dashboard on success

**`spotify-export`**
- Called when DJ clicks "Export to Spotify" on a client row
- Reads tokens from `spotify_tokens`, refreshes access token if expired
- Validates all sections before doing any Spotify work (fail fast)
- Creates or updates playlists for each moment
- Returns success summary or validation errors

### New Database Table: `spotify_tokens`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Single row, always upserted |
| `access_token` | text | Expires every hour |
| `refresh_token` | text | Long-lived, used to get new access tokens |
| `expires_at` | timestamptz | When access token expires |
| `updated_at` | timestamptz | Auto |

Single-row table — always upserted on new auth.

---

## OAuth Flow

1. DJ clicks **"Connect Spotify"** in admin dashboard
2. Admin calls `spotify-auth` Edge Function
3. `spotify-auth` redirects to Spotify authorization URL
4. DJ approves on Spotify
5. Spotify redirects to `spotify-callback` Edge Function URL
6. `spotify-callback` exchanges code for tokens, stores in `spotify_tokens`
7. Redirects DJ back to admin dashboard
8. "Connect Spotify" button turns green — "Spotify Connected ✓"

**Redirect URI to register in Spotify dashboard:**
`https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-callback`

**Spotify app:** Chi Loader (`ecb4eb3edb86498cad342641540efe5d`) — already in Development mode, which is sufficient since only the DJ uses this.

---

## Export Flow

### Validation (before any Spotify calls)

Scan all non-deleted `wedding_selections` rows for the client. Skip playlist-type sections (guest-seating, cocktail-hour, dinner-hour, dance-floor) since those are playlists, not individual songs.

For each remaining section:
- **True blank** (`spotify_url` is null) → block export, return list of missing moments
- **Non-Spotify URL** (YouTube, SoundCloud, manual title, any non-`open.spotify.com/track/` URL) → flag for manual handling but do NOT block

If any true blanks exist, return error with list of missing moments. Export does not proceed.

### Playlist Creation / Update

For each moment (including non-Spotify ones):

**Playlist naming:** `{Client Name} — {Moment Label}`
Example: `Sierra & Thad — First Dance`

**If Spotify track URL:**
- Search for existing playlist with this name in DJ's library
- If found: clear existing tracks, add current track
- If not found: create new playlist, add track

**If non-Spotify URL:**
- Search for existing playlist with this name
- If found: clear tracks (leave empty), update description with the URL
- If not found: create new empty playlist
- Playlist description: the full YouTube/SoundCloud/other URL so DJ can pull it up instantly
- Playlist name gets no special suffix — the empty playlist + description is the signal

**If true blank:** export was already blocked in validation — this case never reaches playlist creation.

### Token Refresh

Before each export, check `expires_at`. If expired (or within 5 minutes of expiring), use `refresh_token` to get a new `access_token` from Spotify. Update `spotify_tokens` with new values.

---

## Admin Dashboard Changes

### "Connect Spotify" Button
- Shown at the top of the admin dashboard (near the header)
- **Disconnected state:** "Connect Spotify" button (outlined)
- **Connected state:** "Spotify Connected ✓" (green, non-clickable or re-auth on click)
- Determined by whether a valid row exists in `spotify_tokens`

### Per-Client "Export to Spotify" Button
- Added to each client row in the clients table (alongside Send Link, Lock, Delete)
- On click: calls `spotify-export` with the client's `client_key`
- **Loading state:** spinner while export runs
- **Success:** brief green "Exported ✓" confirmation
- **Validation error:** modal or inline message listing which moments are blank (true blanks only)

---

## Error Handling

| Scenario | Behavior |
|---|---|
| True blank section | Block export, list missing moments by label |
| Non-Spotify URL | Export proceeds, empty playlist created with URL in description |
| Spotify token expired | Auto-refresh before export |
| Spotify not connected | "Export" button disabled or shows "Connect Spotify first" |
| Spotify API error | Show error message, do not partially update |
| Track not found via Spotify URL | Log warning, create empty playlist with URL in description (treat like non-Spotify) |

---

## Playlist Sections — Export Scope

**Included in export (song moments):**
Wedding Party Walk, Bride Walk, The Kiss, Ceremony Exit, Wedding Party Entrance, Grand Entrance, First Dance, Father/Daughter Dance, Mother/Son Dance, Anniversary Dance, Last Song of the Night, Cake Cutting, Bouquet Toss, Last Dance (Private), Custom Moments

**Excluded from export (playlist/text moments):**
Guest Seating, Cocktail Hour, Dinner Hour, Dance Floor Must Plays, Grand Entrance Announcement, Additional Notes, Admin Reply

---

## Environment Variables

```env
SPOTIFY_CLIENT_ID=ecb4eb3edb86498cad342641540efe5d
SPOTIFY_CLIENT_SECRET=<from Spotify dashboard>
SPOTIFY_REDIRECT_URI=https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-callback
```

All set as Supabase secrets (same pattern as `RESEND_API_KEY`).

---

## Backlog (out of scope for this implementation)

- **Song timestamp notes:** Each song selection should have an "additional notes" field for time marks (e.g. "start at 0:42"). When present, include in the Spotify playlist description alongside any non-Spotify URLs. (Tracked in Jira: WED backlog)
