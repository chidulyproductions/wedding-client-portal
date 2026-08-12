---
status: ACTIVE
date: 2026-08-11
---
# Design: Custom-edit label + demoted Spotify backup link

Two connected changes to a section that has a custom edit attached:

1. The line above the player names the track and the cut — `Young & Beautiful — Quick Hitter` — instead of the generic `Custom edit`.
2. The Spotify link stops sitting at the top of the section pretending to be the selection. It moves below the player, visually demoted, labelled as a disaster-recovery backup.

## Why

The link's only purpose on an edited moment is the Spotify export — a rebuild path if the program is lost or the DJ can't make it. It is never the version that plays. Presenting it first, styled like a normal selection, tells the couple the opposite.

## The label

`song_title — audio_name`, e.g. `Young & Beautiful — Quick Hitter`.

Fallbacks, so it never renders empty:
- no `audio_name` → `song_title` alone
- neither → `Custom edit`

`audio_name` is a new column, prefilled at upload from the filename and editable in place.

### Why not derive it on the fly

Auto-derivation was tested against all eight real edits. Half were unusable:

| Filename | Derived | Problem |
|---|---|---|
| `...(Chi Duly Quick HItter)` | `Quick HItter` | typo reaches the client |
| `...(Sierra Thad Wedding Edit - Chi Duly)` | `Sierra Thad Wedding Edit` | couple's own names in their label |
| `...(Moonlight Version - Chi Duly Intro)` | `Intro` | dropped the meaningful part |
| `...(Chi Duly Wedding Edit)` ×2 | `Wedding Edit` | generic |

So the parse is a starting point, not the answer. It prefills; a human corrects.

### Editing

Click the label to edit in place; saves on blur. No new field, no separate admin screen.

**Accepted consequence:** the portal has no client/admin separation, so the couple can rename an edit. Same exposure as every other field on the page, and low-stakes.

## The backup link

Below the player and the attach control, under a dashed divider:

- Heading: `Spotify backup link`
- One line: not the version that plays; kept so the program can be rebuilt as a Spotify playlist if something goes wrong on the day.
- The input itself, quieted (muted text, recessive background) but still editable, so the couple can change the underlying song without going through the DJ.

The header badge flips `SONG LINK` → `CUSTOM EDIT` when audio is attached, which does much of the work on its own.

Sections with no audio are completely unchanged.

## Data

```sql
alter table wedding_selections add column audio_name text;
```

Written by the same partial-upsert path as `audio_url`, so `spotify_url` stays untouched. Cleared alongside `audio_url` on every removal path.

Brian & Stephanie's four existing rows get backfilled so they don't sit blank.

## Out of scope

- No client/admin permission split.
- No renaming of stored objects — they stay UUID-named and unguessable.
- No change to the Spotify export, which still reads `spotify_url` only.
