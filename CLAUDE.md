# Wedding Music Site — Chi Duly Productions

## Architecture

Static site (no build step) hosted on **GitHub Pages**. Backend is **Supabase** (Postgres + Edge Functions). Some serverless functions on **Netlify**.

### Key Files

- `spotify-selections.html` — Client-facing music portal. Clients paste Spotify/YouTube/SoundCloud links for each wedding moment. Has brochure (live program preview), per-section notes, additional notes + admin reply display.
- `admin.html` — Admin dashboard. Manage clients, send magic links, edit name/date/email, toggle lock, delete clients, view client notes and send replies (with email notification).
- `index.html` — Landing/login page.
- `netlify/functions/` — Netlify serverless functions (`load-selections.js`, `save-selection.js`, `spotify.js`).
- `supabase/functions/send-reply-email/` — Supabase Edge Function. Sends email via Resend when admin replies to client notes.

### Data Flow

- **Save**: Client page uses Supabase JS client (`sb`) to upsert into `wedding_selections` table directly.
- **Load**: Client page calls Netlify edge function `load-selections` which queries Supabase and returns all rows for a `client_key`.
- **Client key**: Derived from URL params `name` + `date`, lowercased, non-alphanumeric replaced with `-`. Example: `madison---mitchell-2026-05-09`.

### Supabase Tables

- `clients` — id, name, wedding_date, email, locked
- `wedding_selections` — client_key, section_id, spotify_url, song_title, artist, notes, updated_at, user_id. Unique on `(client_key, section_id)`.

### Special section_id Conventions

- `{section}-notes` — Per-section notes (stored in `notes` column)
- `additional-notes` — Client's general note from the bottom textarea
- `admin-reply` — Admin's reply (shown on client page, triggers email)
- `custom-def-{id}` — Custom moment definitions (`song_title = '__custom_def__'`, label in `notes`)
- `announcement` — Client announcement text
- Null `spotify_url` with no `__custom_def__` = tombstone (section was deleted/removed)

## Deployment

- **Frontend**: Push to `main` → GitHub Pages auto-deploys (~1 min).
- **Supabase Edge Functions**: Deploy via CLI: `supabase functions deploy <name> --no-verify-jwt`
- **Netlify Functions**: Auto-deploy from repo.
- **Supabase secrets**: `supabase secrets set KEY=VALUE`

## Environment

- Supabase project ref: `lfnlftxqdelcrmbceiob`
- Resend domain: `chiduly.com` (email from `notifications@send.chiduly.com`)
- RLS is **disabled** on `wedding_selections` (anon key is public in frontend)
- Auth: Magic links via `sb.auth.signInWithOtp` for client access; admin uses Supabase auth

## Gotchas

- The `saveSelection` function shows "Save failed" / "Connection error" in the saved pill if the write fails. Check this if saves seem broken.
- Playlist sections (guest-seating, cocktail, dinner, dance-floor) use the same `embedSpotify` flow as single tracks — the embed height adjusts based on `extracted.type`.
- `fetchSongInfo` calls oEmbed APIs. If oEmbed fails, the title stays null but the URL still saves.
- The brochure (program card at top of client page) updates live via `updateProgram()` and is driven by `sectionProgramMap`.
- Delete uses a tombstone pattern (upsert with null spotify_url), not actual DELETE, so the section stays hidden on reload.
- `clearSelection` does an actual DELETE from the table (different from remove/undo which uses tombstones).
