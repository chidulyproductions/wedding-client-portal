# Wedding Music Site — Chi Duly Productions

## Architecture

Static site (no build step) served by **GitHub Pages** from `main`. The backend is **Supabase**:
Postgres, Storage, and Edge Functions. Nothing the pages call runs on Netlify.

### Key Files

- `spotify-selections.html` — Client-facing music portal. Clients paste Spotify/YouTube/SoundCloud links for each wedding moment. Has brochure (live program preview), per-section notes, additional notes + admin reply display.
- `admin.html` — Admin dashboard. Manage clients, send magic links, edit name/date/email, toggle lock, delete clients, view client notes and send replies (with email notification), export to Spotify.
- `index.html` — Landing/login page.
- `supabase/functions/` — every Edge Function, one folder each (table below).
- `supabase/migrations/` — schema, plus the trigger that calls `notify-dj`.
- `.github/workflows/keepalive.yml` — pings the Supabase REST API every 3 days so the free-tier project is not paused (see `ERRORS.md`).
- `netlify/functions/` — **legacy.** Old Netlify-format copies of `load-selections` and `save-selection`. No page calls them. A Netlify site is still connected to this repo and redeploys on every push, but it is not the site clients use.

### Edge Functions (all deployed on Supabase)

| Function | Called from | Does |
|---|---|---|
| `load-selections` | client page, on load | Returns every row for a `client_key`, oldest first. Uses the service-role key. |
| `save-selection` | client page, `saveCustomMomentDef` only | Writes a custom-moment definition row. Uses the service-role key. |
| `spotify` | client page | Looks up track / playlist / album metadata for a Spotify URL. |
| `notify-dj` | database trigger on `wedding_selections` | Emails the DJ when a client saves or changes a selection. |
| `send-reply-email` | admin page | Emails the client via Resend when the admin replies to a note. |
| `admin-delete-client` | admin page | Deletes a client. |
| `spotify-auth`, `spotify-callback` | admin page | OAuth connect for the DJ's Spotify account. |
| `spotify-export` | admin page | Builds Spotify playlists from a client's program. |

`load-selections` and `save-selection` were deployed in March 2026 and their source was never
committed. It was downloaded from Supabase into this repo on 2026-10-08, unchanged.

### Data Flow

- **Load**: the client page fetches `…supabase.co/functions/v1/load-selections?clientKey=…`.
- **Save**: the client page upserts into `wedding_selections` directly with the Supabase JS client (`sb`) and the public anon key. The one exception is a custom-moment definition, which goes through the `save-selection` function.
- **Client key**: Derived from URL params `name` + `date`, lowercased, non-alphanumeric replaced with `-`. Example: `madison---mitchell-2026-05-09`.

### Supabase Tables

- `clients` — id, name, wedding_date, email, locked. **RLS is ON** and writes require an authenticated session (unlike `wedding_selections`), so the anon key cannot create or edit clients.
- `wedding_selections` — client_key, section_id, spotify_url, audio_url, audio_name, song_title, artist, notes, updated_at, user_id. Unique on `(client_key, section_id)`.

### Supabase Storage

- `client-audio` — public bucket for uploaded custom audio. Objects are named with a random UUID plus the original extension, so URLs are public but unguessable. The bucket itself enforces a 25 MB file size limit and an audio-only MIME allowlist; anon may read, insert, and delete.
- **Known exposure:** because the anon key is public, anyone can upload to this bucket without any relationship to a real client. Per-file limits are enforced but total volume is not, and the free tier caps at 1 GB (~40 max-size files). If uploads ever look wrong, list the bucket and cross-check every object against an `audio_url` in `wedding_selections` — anything unreferenced is junk.

### Special section_id Conventions

- `{section}-notes` — Per-section notes (stored in `notes` column)
- `additional-notes` — Client's general note from the bottom textarea
- `admin-reply` — Admin's reply (shown on client page, triggers email)
- `custom-def-{id}` — Custom moment definitions (`song_title = '__custom_def__'`, label in `notes`)
- `announcement` — Client announcement text
- Null `spotify_url` **and** null `audio_url`, with no `__custom_def__` = tombstone (section was deleted/removed). `spotify_url` alone is no longer sufficient — see Gotchas.

## Deployment

- **Frontend**: push to `main` → GitHub Pages rebuilds (~1 min). Live at
  `https://chidulyproductions.github.io/wedding-client-portal/`. Clients use this site, so
  work on a branch and merge when it is ready.
- **Edge Functions**: not deployed by a push. Deploy each by hand:
  `supabase functions deploy <name> --project-ref lfnlftxqdelcrmbceiob --no-verify-jwt`
  (`send-reply-email` is the exception: `config.toml` sets `verify_jwt = true` for it.)
  See what is live with `supabase functions list --project-ref lfnlftxqdelcrmbceiob`.
- **Supabase secrets**: `supabase secrets set KEY=VALUE`

## Tests

```bash
cd supabase/functions/spotify-export && deno test   # export section selection
cd supabase/functions/notify-dj && deno test        # notification line formatting
```

The HTML pages have no automated tests. When a function test passes but production is
wrong, compare the fixture with a real row from Supabase (see `ERRORS.md`).

## Environment

- Supabase project ref: `lfnlftxqdelcrmbceiob`
- Resend domain: `chiduly.com` (email from `notifications@send.chiduly.com`)
- RLS is **disabled** on `wedding_selections` (anon key is public in frontend)
- Auth: Admin uses Supabase auth to log into the dashboard. Admin sends client magic links via `sb.auth.signInWithOtp`, but `spotify-selections.html` itself has no auth calls — client saves go through the public anon key. Client-side auth enforcement is a deferred future change.

## Gotchas

- The `saveSelection` function shows "Save failed" / "Connection error" in the saved pill if the write fails. Check this if saves seem broken.
- Playlist sections (guest-seating, cocktail, dinner, dance-floor) use the same `embedSpotify` flow as single tracks — the embed height adjusts based on `extracted.type`.
- `fetchSongInfo` calls oEmbed APIs. If oEmbed fails, the title stays null but the URL still saves.
- The brochure (program card at top of client page) updates live via `updateProgram()` and is driven by `sectionProgramMap`.
- Delete uses a tombstone pattern (upsert with null spotify_url), not actual DELETE, so the section stays hidden on reload.
- `clearSelection` does an actual DELETE from the table (different from remove/undo which uses tombstones).

### Custom audio

- A moment can carry an uploaded file (`audio_url`) **alongside** its `spotify_url`. When it does, the section renders **only** the audio player: `embedSpotify` writes through a `setEmbed` closure that is a no-op while `audioUrls[sectionId]` is set. The link is deliberately kept so the Spotify export still carries the original unedited version as a backup — that is the whole point of the feature, so never let an audio write clear `spotify_url`.
- `spotify_url IS NULL` used to be a reliable tombstone marker. It is not any more: an audio-only moment has a null `spotify_url`. Anything testing for a deleted section must check `audio_url` too — `loadSelections` does. `spotify-export` is unaffected because it only exports `open.spotify.com/track/` URLs anyway.
- Deleting audio (remove edit, clear selection, or remove section) deletes the storage object as well. Undo after removing a section restores the section **without** its audio, on purpose — an upload is never the only copy.
- `undoRemove` must leave the database consistent, not just the DOM. With a link it re-saves non-silently (`embedSpotify(id, false)`); with nothing to save it DELETEs the row, because an empty row is indistinguishable from a tombstone and would re-hide the section on reload.
- Audio URLs read back from the database are untrusted (RLS is off, anon key is public). `isTrustedAudioUrl` gates anything reaching an `<audio>` src or a download href, and the audio UI is built with DOM methods rather than markup strings. Keep it that way.
- When a section has audio it gets the `has-edit` class, which re-sequences `.section-body` with flex `order`: player first, then the attach control, then the Spotify link under a "Spotify backup link" heading. Ordering is CSS-only — no nodes move — so every existing element keeps its handlers. The header badge flips `SONG LINK` → `CUSTOM EDIT`.
- **Serato caches metadata in memory.** A rename in Serato reaches neither the file's ID3 tag nor `database V2` until Serato is quit (or the write otherwise commits). If an upload shows a stale title, check `pgrep -i serato` and the mtime of `~/Music/_Serato_/database V2` before suspecting the site. `~/Music/_Serato_/tools/db_song_titles.py` reads the `tsng` values Serato's song column displays.
- **Serato is the truth source for a custom edit's display title.** `audio_name` is read from the uploaded file's **ID3 title tag** (`readId3Title`, a hand-rolled ID3v2 parser — no dependency, this repo has no build step), which is the string Serato's "song" column shows. It is self-contained, so the player label displays it verbatim and is **not** composed with `song_title`. Filename parsing (`editNameFromFileName`) is a fallback for files with no tags.
- **Upload the Serato-library copy, not the event-folder copy.** They are different files with the same name — verified 2026-08-11 on Brian & Stephanie's edits, different md5, and the event-folder copies of two of them carried no ID3 tags at all.
- The label was briefly two composed spans (song title + name). Don't rebuild that: `song_title` is rewritten asynchronously when the oEmbed lookup resolves, so anything that parses a name back out of a combined string will eventually swallow the whole label.
- **The edit's title wins everywhere, brochure included** (Chris's call, 2026-08-12). An upload writes the tag into `song_title` as well as `audio_name`, so the program summary names the edit rather than Spotify's version of the song. The artist is preserved via the `songArtists` map — check any new `updateProgram` call passes it, or the brochure silently loses the artist prefix.
- Because `song_title` is overwritten, the Spotify title is *gone* — so `removeAudio` calls `embedSpotify(id, false)` **non-silently** to re-fetch it. Silent mode would repaint the embed and leave the edit's name in the brochure forever.
- The oEmbed callback in `embedSpotify` skips saving its title while `audioUrls[sectionId]` is set (`titledByEdit`), or re-submitting the backup link would quietly restore Spotify's title over the one from Serato.
- **`updateProgram` pins the title itself** when the moment has an edit — it ignores whatever title the caller passed and uses `audioNames[sectionId]`. Guarding call sites was not enough: `fetchSongInfo` calls `updateProgram` *internally* and repaints asynchronously after load, so the brochure would revert to Spotify's title seconds after showing the right one. Enforce invariants at the paint point, not at the callers.
- Downloads use Supabase's `?download=<filename>` parameter, not the HTML `download` attribute — the attribute is ignored cross-origin, and the page and the file are on different origins.
- `saveAudioUrl` writes only `audio_url`; PostgREST leaves omitted columns alone. Any hand-written REST upsert must pass `?on_conflict=client_key,section_id` in the query string or it 409s on the unique constraint.

## Tracking

- Deferred work: `TODOS.md`. Failed approaches and their fixes: `ERRORS.md`.
- This repo is **public** and GitHub Pages serves every file in it, this one included. Keep
  secrets out of the repo, and remember that the notes above about RLS and the upload bucket
  are readable by anyone.
