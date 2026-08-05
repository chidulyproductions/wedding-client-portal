---
status: ACTIVE
date: 2026-08-05
---
# Design: Custom Audio Upload

Let anyone using a client portal attach an audio file to a wedding moment — either a custom
edit Chris produced, or audio the client supplies (a voice recording, a family song, a
friend's cover). The file becomes the thing played at the wedding. Any Spotify link on that
moment is kept, silently, so the exported Spotify playlist still carries the original
unedited version as a backup.

## Motivation

Today a moment holds one thing: a link. Some moments can't be expressed as a link at all
(client-supplied audio), and some need a specific edit that no streaming service has.

The Spotify export exists as a fallback: if the laptop or the local files fail on the night,
the Spotify playlists are the safety net. That safety net only works if the original link
survives the arrival of a custom edit. So an upload must never overwrite or remove a link.

## Requirements

1. Any portal visitor can attach audio, with no more ceremony than pasting a link.
2. Attaching audio does **not** disturb the Spotify link on that section. The link keeps
   flowing to the Spotify export unchanged.
3. When audio is attached, the section displays **only** the audio player. The Spotify
   iframe is not rendered. Two players on one moment is the thing being avoided.
4. The link text box stays visible and editable, so a backup link can be added or corrected
   after the audio is attached.
5. Audio is downloadable, so the file can be pulled onto the DJ laptop for the gig.
6. Uploads are audio-only and capped at 25 MB, enforced server-side.
7. A locked client portal accepts no new uploads. Existing audio stays playable.

## Non-goals

- No admin-side upload UI. Chris uses the client's own portal link, same as anyone else.
- No admin-side "all audio for this wedding" listing. Deferred to TODOS.md.
- No transcoding, waveform display, trimming, or in-browser editing.
- No change to how the Spotify export builds playlists.

## User-visible behavior

### The control

Each section gains one row beneath its existing link row: an **Attach custom edit** file
picker. Present on every section — the fixed moments and custom moments alike. The link row
above it is unchanged.

### Uploading

Choosing a file uploads it immediately. The picker is replaced by a progress state while it
runs. On success the section renders an audio player with a download button.

On failure the row shows the reason (too large / not an audio file / connection failed) and
the section is otherwise untouched — no partial row is written, no link is disturbed.

### Section states

| State | What renders |
|---|---|
| Link only | Unchanged from today: platform embed, notes, saved pill. |
| Link + audio | Audio player + download. **No embed.** Link box still visible and editable. |
| Audio only | Audio player + download, plus a required name field (see below). |
| Neither | Unchanged from today. |

### Naming

When a Spotify link is present, the brochure title comes from the link's oEmbed lookup as it
does today. The audio needs no name of its own.

When there is no link, there is no title to borrow, so a name field appears — prefilled from
the filename, editable, required. That name is the brochure title and the download filename.

The download always uses a readable filename rather than the stored UUID: the section's song
title when a link supplies one, otherwise the name given at upload, plus the original
extension.

### Replacing and removing

- Attaching a second file replaces the first. The previous object is deleted from storage so
  orphans don't accumulate.
- An ✕ on the player removes the audio and deletes its object. The Spotify link and its
  embed come back.
- Clearing the whole section removes both the row and the stored object.
- Removing a section (the tombstone path) hides it but leaves the object in place, matching
  how removal already preserves the row for undo.

### Brochure

Unchanged for link-only moments. A moment with audio attached shows its title with a small
**custom edit** tag. An audio-only moment shows the name given at upload.

## Data model

### Storage

A new public-read Supabase Storage bucket, `client-audio`.

- Object path: a generated UUID plus the original extension (`{uuid}.mp3`). No client name or
  section in the path — the URL is public, so it must not be guessable.
- Bucket `file_size_limit`: 25 MB.
- Bucket `allowed_mime_types`: audio types only.

Both limits are set on the bucket, not just checked in the page, so the browser check is a
courtesy and the server is the enforcement. Anonymous insert is permitted, consistent with
the existing trust model (RLS is already off on `wedding_selections` and the anon key ships
in the page).

### Table

One column added to `wedding_selections`:

```sql
ALTER TABLE wedding_selections ADD COLUMN audio_url text;
```

`spotify_url` keeps its exact current meaning and is never written by the upload path.

The section's storage object path is derived from `audio_url` for deletes — no second column.

## Consumers

| Consumer | Reads | Change needed |
|---|---|---|
| `spotify-export` | `spotify_url`, whitelisted to `open.spotify.com/track/` | **None.** Audio is invisible to it; playlists are unaffected. |
| `load-selections` (Netlify) | Whole row, no column list | **None.** `audio_url` flows through automatically. |
| `saveSelection` (portal) | Writes a fixed field set | Upsert payloads omit `audio_url`, so link saves leave audio intact. Needs a test to prove it. |
| Brochure (`updateProgram`) | Title/artist per section | Add the *custom edit* tag when `audio_url` is set. |
| `notify-dj` trigger | `spotify_url`, titles | **To verify** — see Open question below. |
| `admin.html` | Selections per client | None in this change. |

## Open question to resolve during implementation

Does the `notify-dj` trigger fire on an `audio_url`-only update, and does the resulting email
read sensibly? Its template formats a song line from `spotify_url` and title, so an audio-only
change could produce an email whose before and after lines are identical.

"Client attached a custom edit" is a notification worth having. The resolution is to check the
trigger's actual column scope first and then either leave it alone, or extend the template with
an audio line — not to guess now.

## Testing

- Link-only section still embeds, saves, and exports exactly as before (regression).
- Attaching audio to a section that has a link: embed disappears, player appears,
  `spotify_url` is unchanged in the database, export still emits the original track.
- Attaching audio to an empty section: name field required, brochure shows the given name.
- Editing the link after attaching audio: link saves, no embed appears, audio survives.
- Replacing audio deletes the prior storage object.
- Removing audio restores the embed and leaves `spotify_url` intact.
- Oversize file and non-audio file are both rejected, by the bucket and not only by the page.
- A locked portal refuses upload.
- Reload after each of the above restores the same visible state.
