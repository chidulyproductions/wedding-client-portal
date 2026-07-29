# `/program-sync` — one-shot wedding program update

**Date:** 2026-07-29
**Status:** Approved design, pending implementation plan

## Problem

Chris checks in on a wedding's music program every few weeks. Today that check-in is manual and expensive: re-read the text thread, compare against the client portal, notice what's missing, rebuild Serato crates, re-export Spotify, remember when the next call should be. It takes a long working session and the expensive part — noticing that a text from three weeks ago changed a song — is the part most likely to be skipped.

**Goal:** one short prompt Chris can fire and walk away from, which leaves the program, the crates, the Spotify export, and the calendar all current, and hands back a short report of what changed and what still needs a human.

## Non-goals

- Not a replacement for Chris's judgment on music. It surfaces and files; it does not choose songs.
- Not a client-facing feature. Couples never see it run.
- Not a scheduled job in v1. Manual trigger only. (A weekly cron is a later option once the manual path is trusted.)
- Does not send anything to anyone. No texts, no emails, no calendar invites to third parties.

## Trigger

```
/program-sync brian & stephanie
```

Fuzzy-resolves the couple to a `client_key`, wedding date, event folder, and calendar event. Bare `/program-sync` runs every wedding in `+00_Upcoming Weddings/`.

## Architecture

Hybrid: **deterministic Python helpers do the mechanical work, Claude does only the interpretation.**

A pure script cannot decide whether *"Jk she wants this is The wedding party walk down"* is a song change. A pure agent re-derives mechanical work every run, burns tokens, and drifts between runs. So:

| Layer | Does | Why |
|---|---|---|
| Python helpers | mine chat.db, diff Supabase, build crates, assemble handoff, compute meeting windows | testable, identical every run, cheap |
| Claude | classify ambiguous human messages into program changes; write the report | needs judgment |

Helpers live in `tools/program_sync/` in this repo, invoked by the skill. Serato-specific crate code reuses the existing builders in `~/Music/_Serato_/tools/`.

## Stages

### 0 · Resolve
Couple name → `client_key`, wedding date, event folder, calendar event, days-until (`T-minus`). Loads the per-wedding state file (below). Reads a `second_dj` flag to decide whether stage 6 runs.

### 1 · Mine
Everything since the last watermark:
- **iMessage** — `~/Library/Messages/chat.db`, the couple's handle(s), messages after the last-seen `ROWID`. `attributedBody` decoded where `text` is null.
- **Email** — `chris@chiduly.com` via Gmail MCP, threads after the watermark.
- **Spotify drift** — for every playlist URL referenced in the program, compare stored `snapshot_id`. Catches a couple silently editing their dance-floor playlist, which no message would reveal.
- **Planner workbook** — live Google Sheet if the wedding has one. Production Schedule tab only (song picks live in its NOTES column).

Output: a candidate change set, each item carrying its **verbatim source quote** and timestamp.

### 2 · Diff against the truth source
`wedding_selections` for the `client_key` is authoritative. Each candidate is classified:

- `FILLS_GAP` — section currently empty
- `SWAP` — different song than what's stored
- `CONFIRMS` — client approved an admin-entered pick (closes an open question)
- `STALE_NOTE` — stored note is now obsolete
- `NO_OP` — already reflected

Independently, structural checks run every time regardless of new messages:
- sections with no row at all
- `entered_by='admin'` picks with no client confirmation
- tombstones (deliberately removed, not gaps)
- playlist sections whose runtime is too short for their slot
- program tracks missing from the local Serato library, or below the 320kbps floor

### 3 · Apply — split by ownership
Follows the established rule: Chris-owned artifacts are edited autonomously, client-visible surfaces are confirmed.

**Automatic:** Serato crates, Spotify export, calendar, `docs/chi-duly-events-todo-*.md`, the wedding's `BRIEFING.md`, the Coleman handoff folder.

**Queued for approval:** every write to `wedding_selections`. Presented as a numbered list, each with the quoted source text, so Chris approves against evidence rather than a paraphrase. One reply applies them.

Portal writes via anon REST are stamped `entered_by='client'` by the DB trigger. Applied changes therefore embed provenance in the note text itself (`— from Brian, text 2026-07-28`) so the record is honest regardless of the column.

### 4 · Spotify export
Calls the existing `spotify-export` edge function — the same thing the admin **Export ♫** button hits. Already idempotent: `findPlaylistByName` → `PUT` replaces tracks, so re-running refreshes `{Couple} — NN Moment` in place rather than duplicating. Nothing new to build here.

Regenerates `SPOTIFY-PROGRAM.md`, the ordered links index, on every run so it cannot drift from the portal.

### 5 · Serato crates
Builds/refreshes the per-wedding crate tree using the existing naming convention (parent `<Couple> - <City State> <M-D-YY> <Start>pm`, numbered subcrates with gaps, `archived` for swaps).

Matching follows established tiers: strict artist+title for special-moment songs, relaxed/best-guess for playlist-derived crates with every substitution reported. Play count breaks ties. Playlist crates sort by Spotify popularity descending.

**Hard precondition: Serato must not be running.** It rewrites `Subcrates/` wholesale on launch/save and will silently destroy externally-written crates. The helper aborts with a clear message if Serato is open, and the report tells Chris to open Serato once afterward to ingest.

Unmatched tracks become a sourcing list in the report rather than a silent gap.

### 6 · Second-DJ handoff package — conditional
Runs only when the wedding carries a `second_dj` flag. Most weddings skip it entirely. Built in v1 anyway so it exists the next time Chris supplies gear and program for another DJ.

Assembles a cloud folder:
- **all program audio** — full files, not just what the other DJ might lack
- **`.crate` files** — for direct Serato import
- **`.m3u8`** — portable fallback, because `.crate` stores absolute paths (`/Users/chiduly/Music/0000SErato/…`) that will not resolve on another machine
- **`PROGRAM.md`** — order, exact versions, cue points, edit notes, do-not-play
- **`SPOTIFY-PROGRAM.md`** — the ordered playlist links index
- **`README.md`** — the exact drop location the other DJ must use for the crate paths to resolve

### 7 · Meetings
- **Final catchup with the couple:** T-30 → T-14 window. If today is inside it and no call is booked, create a hold on the **Primary** calendar.
- **Chris ↔ second DJ sync:** before load-in, when `second_dj` is set.
- Never on the DJ Calendar — that is gigs only.
- Holds are created without attendees. Chris invites people himself; the pipeline never sends invitations.
- Agenda is generated from the open items found in stage 2.

### 8 · Report
Short, scannable: what changed and from where, what was applied automatically, what is queued for approval, what is blocked, what to ask the couple, next meeting date.

## State

`.program-sync-state.json` in each event folder:

```json
{
  "client_key": "brian---stephanie-2026-08-15",
  "last_run": "2026-07-29T08:00:00Z",
  "imessage_last_rowid": 224981,
  "email_watermark": "2026-07-28T00:00:00Z",
  "playlist_snapshots": { "4L07syZPv4k4pjWGM92F8G": "MTcs..." },
  "second_dj": { "name": "Coleman Howard (CFLO)", "handoff_path": "..." }
}
```

Without it, every run re-surfaces months-old messages. With it, runs are incremental and safe to repeat.

## Safety rails

1. Never sends messages, emails, or calendar invites.
2. Never writes to third-party artifacts (planner sheets, client Spotify playlists, Wave).
3. Refuses to build crates while Serato is running.
4. Portal writes always queue for approval; never auto-applied.
5. Idempotent — re-running changes nothing that is already correct.
6. Reads `~/Library/Messages/chat.db` read-only, scoped to the couple's handles and the date window.

## Open decisions

**Spotify link visibility.** Exported playlists are created `public: false`. Whether a non-owner can open a private Spotify playlist by link is uncertain and has changed over time — this must be tested, not assumed. Test: send one existing export link to the other DJ and see whether it opens. If it does not, flipping to public is a change affecting every couple's program and requires an explicit decision.

## Build order

1. Stages 0–2 + 8 — resolve, mine, diff, report. Read-only. Delivers most of the value and is safe to trust early.
2. Stage 3 — the apply/queue split.
3. Stage 4 — Spotify export call (thin; the function already exists).
4. Stage 5 — Serato crates.
5. Stages 6–7 — handoff package and meetings.

Each phase is independently useful; the pipeline is valuable at the end of phase 1.

## Testing

- Unit tests for the diff classifier against fixture selection rows.
- Unit tests for `attributedBody` decoding and watermark logic.
- Crate builder tested against a scratch `_Serato_` directory, never the live library.
- Dry-run mode (`--dry-run`) that reports without writing anything, used for the first run on each wedding.
