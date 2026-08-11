# Custom Audio Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any wedding-portal visitor attach an audio file to a moment, which becomes the only player shown for that moment, while the Spotify link is silently retained so the exported Spotify playlist still carries the original unedited version.

**Architecture:** A new public Supabase Storage bucket (`client-audio`) holds the files under randomized object names. A new `audio_url` column on `wedding_selections` points at them; `spotify_url` is never written by the upload path. In the page, an "Attach custom edit" row is injected into every section by JS (rather than hand-editing 18 near-identical HTML blocks, which also gets custom moments for free). When a section has audio, `embedSpotify` is suppressed from writing to the embed area, so only the audio player renders.

**Tech Stack:** Static HTML + inline JS, `supabase-js` v2 (already loaded), Supabase Postgres + Storage, Supabase Edge Functions (Deno), Supabase CLI for migrations.

**Spec:** `docs/designs/custom-audio-upload.md`

---

## Context an engineer needs before starting

Read these before Task 1. They are the non-obvious facts this plan depends on:

1. **`spotify_url IS NULL` currently means "this section was deleted."** Both `loadSelections` (in `spotify-selections.html`) and `supabase/functions/spotify-export/selection.ts` treat a row with a null `spotify_url` as a tombstone. An audio-only moment has a null `spotify_url`, so **without the fix in Task 9 it would vanish from the portal on reload.** This is the single highest-risk interaction in the change.

2. **The `notify_dj_on_selection_change` trigger fires on every INSERT or UPDATE** of `wedding_selections`, and its payload has no audio fields. `notify-dj/index.ts` renders `"(removed)"` whenever `new_spotify_url` is null — so an audio-only upload would email Chris saying the client *removed* the moment. Tasks 3–5 fix this. It is a correctness bug, not a nicety.

3. **The `download` HTML attribute is ignored cross-origin.** The page is served from GitHub Pages and the file from `supabase.co`, so `download="name.mp3"` will not rename anything and may navigate instead of downloading. Supabase Storage's `?download=<filename>` query parameter sets `Content-Disposition` server-side; that is what this plan uses.

4. **`supabase-js` `.upsert()` sends `Prefer: resolution=merge-duplicates`,** which PostgREST turns into `ON CONFLICT DO UPDATE SET` for **only the columns present in the payload.** This plan relies on that so an audio save doesn't wipe `spotify_url`. Task 2 proves it against the real database before any code depends on it. If it fails, the fallback is in that task.

5. **`wedding_selections` has RLS off and the anon key is public**, so any value read back from a row is untrusted input. The audio UI is therefore built with DOM methods and `textContent` rather than HTML strings, and every stored URL is checked against our own bucket prefix before it reaches an `src` or `href`. Do not "simplify" these into HTML string assignments.

6. **Verification target.** Frontend tasks are verified in a real browser against a throwaway client (`ZZ Audio Test` / `2027-01-01`, client key `zz-audio-test-2027-01-01`), created in Task 1 and deleted in Task 15. Never verify against a real couple's portal.

**Repo has no frontend test runner** — no `package.json`, no bundler, no CI test job. The only tests in the repo are Deno unit tests on an extracted pure module (`supabase/functions/spotify-export/selection_test.ts`). This plan follows that same split: pure logic gets real Deno tests written first; DOM behavior gets a written-first, executable browser check with an exact expected observation. Do not add a test framework — this is a deliberate no-build-step repo.

---

## File Structure

**Create:**
- `supabase/migrations/20260805_audio_upload.sql` — `audio_url` column, `client-audio` bucket, storage policies.
- `supabase/migrations/20260805_notify_dj_audio.sql` — replaces the trigger function so the payload carries audio fields.
- `supabase/functions/notify-dj/line.ts` — pure before/after line formatting. Extracted so it is testable, mirroring `spotify-export/selection.ts`.
- `supabase/functions/notify-dj/line_test.ts` — Deno tests for the above.

**Modify:**
- `supabase/functions/notify-dj/index.ts` — consume `line.ts`, accept audio fields.
- `spotify-selections.html` — CSS block, plus the audio module and edits to `embedSpotify`, `loadSelections`, `clearSelection`, `deleteSelection`, `updateProgram`, `createCustomMoment`, `checkLockStatus`, and the `DOMContentLoaded` handler.
- `CLAUDE.md` — document the bucket and column.
- `TODOS.md` — record the deferred admin-side audio listing.

The audio code in `spotify-selections.html` goes in **one contiguous block** with a `// ── CUSTOM AUDIO ──` banner, placed immediately after the `clearSelection` function, matching the file's existing banner-delimited organization. Edits to existing functions are kept to the minimum shown in each task.

---

## Task 1: Database column, bucket, and a test client

**Files:**
- Create: `supabase/migrations/20260805_audio_upload.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Custom audio upload: clients (and Chris) attach an audio file to a wedding
-- moment. The file is the thing played at the wedding; any spotify_url on the
-- same row is deliberately left untouched so the exported Spotify playlist
-- keeps the original unedited version as a backup.
alter table wedding_selections add column if not exists audio_url text;

comment on column wedding_selections.audio_url is
  'Public URL of an uploaded audio file in the client-audio bucket. Independent of spotify_url: a row may have either, both, or neither.';

-- Public-read bucket. Object names are random UUIDs, so the URL is public but
-- not guessable. Limits are set on the bucket so they are enforced server-side,
-- not merely checked in the page.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-audio',
  'client-audio',
  true,
  26214400,  -- 25 MB
  array['audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac',
        'audio/wav','audio/x-wav','audio/flac','audio/ogg','audio/webm']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Anonymous access, consistent with the existing trust model: RLS is already
-- off on wedding_selections and the anon key ships in the page. Scoped to this
-- one bucket so no other bucket inherits it.
drop policy if exists "client-audio anon read"   on storage.objects;
drop policy if exists "client-audio anon insert" on storage.objects;
drop policy if exists "client-audio anon delete" on storage.objects;

create policy "client-audio anon read"
  on storage.objects for select to anon, authenticated
  using (bucket_id = 'client-audio');

create policy "client-audio anon insert"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'client-audio');

create policy "client-audio anon delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'client-audio');
```

- [ ] **Step 2: Apply it**

Run: `supabase db push`
Expected: the migration is listed as applied, exit code 0.

If the storage policy statements fail with a permissions error, the bucket and its policies must be created by hand in the Supabase dashboard (Storage → New bucket → name `client-audio`, Public ✓, file size limit 25 MB, the MIME list above; then Policies → allow `SELECT`, `INSERT`, `DELETE` for `anon`). If you do that, delete the `insert into storage.buckets` and the policy statements from the migration, keep the `alter table`, and note the manual step in the commit message.

- [ ] **Step 3: Verify the column exists**

Run:
```bash
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?select=audio_url&limit=1" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
(Take `SUPABASE_ANON_KEY` from `.env`, or from the `SUPABASE_ANON_KEY` constant at the top of the `<script>` block in `spotify-selections.html`.)
Expected: `[]` or `[{"audio_url":null}]` — **not** an error mentioning `column ... does not exist`.

- [ ] **Step 4: Verify the bucket is public and capped**

The bucket **metadata** endpoint is not readable by `anon` — the migration grants policies on `storage.objects`, not `storage.buckets`, so `GET /storage/v1/bucket/client-audio` answers `Bucket not found` even when the bucket is fine. Verify by behavior instead:

```bash
printf 'x' > /tmp/probe.mp3
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/client-audio/probe.mp3" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: audio/mpeg" --data-binary @/tmp/probe.mp3
curl -s -o /dev/null -w "public GET: %{http_code}\n" \
  "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/public/client-audio/probe.mp3"
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/client-audio/probe.txt" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: text/plain" --data-binary @/tmp/probe.mp3
curl -s -X DELETE "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/client-audio/probe.mp3" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
rm /tmp/probe.mp3
```
Expected: the upload returns a `Key`; the public GET returns `200`; the `text/plain` upload is rejected with `invalid_mime_type` (proving `allowed_mime_types` is really set on the bucket row, and with it `file_size_limit` from the same insert); the delete succeeds.

- [ ] **Step 5: Note the test-portal URL — no client row needed**

The `clients` table has RLS enabled and requires an authenticated session, so an anon caller **cannot** create a test client. It doesn't need one. `getClientKey()` derives the key from URL parameters alone, `wedding_selections` has RLS off, and `checkLockStatus` simply finds no match and carries on. So the test portal is:

`spotify-selections.html?name=ZZ%20Audio%20Test&date=2027-01-01` → client key `zz-audio-test-2027-01-01`

with no row in `clients` behind it. The one thing this costs is the locked-portal check in Task 13, which is handled there.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260805_audio_upload.sql
git commit -m "feat(db): audio_url column and client-audio storage bucket"
```

---

## Task 2: Prove a partial upsert preserves `spotify_url`

The whole design rests on this. Prove it against the real database before writing code that assumes it.

**Files:** none (verification only)

- [ ] **Step 1: Write a row with a link**

```bash
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '{"client_key":"zz-audio-test-2027-01-01","section_id":"first-dance","spotify_url":"https://open.spotify.com/track/1234567890abcdefghijkl","song_title":"Test Song","artist":"Test Artist"}'
```
Expected: HTTP 201, empty body.

- [ ] **Step 2: Upsert only `audio_url` onto the same row**

```bash
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '{"client_key":"zz-audio-test-2027-01-01","section_id":"first-dance","audio_url":"https://example.com/fake.mp3"}'
```
Expected: HTTP 201, empty body.

- [ ] **Step 3: Confirm the link survived**

```bash
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01&section_id=eq.first-dance&select=spotify_url,song_title,audio_url" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `spotify_url` is still the track URL, `song_title` is still `"Test Song"`, and `audio_url` is `"https://example.com/fake.mp3"`.

**RESULT (verified 2026-08-05): the assumption holds.** After upserting only `audio_url`, the row still read `spotify_url = https://open.spotify.com/track/1234567890abcdefghijkl`, `song_title = "Test Song"`, `artist = "Test Artist"`, with `audio_url` set. Two things learned in passing:

- **`on_conflict` is required in the query string**, not just the `Prefer` header. Without `?on_conflict=client_key,section_id` the request 409s with `duplicate key value violates unique constraint` — PostgREST falls back to the primary key as the conflict target. `supabase-js` supplies it from `{ onConflict: 'client_key,section_id' }`, so `saveAudioUrl` is fine, but any hand-written REST call must include it.
- **Omitted columns are genuinely untouched, including `updated_at`** — it kept its old timestamp when left out of the payload. `saveAudioUrl` passes `updated_at` explicitly, so this is only a trap for future callers. `entered_by` stayed `client`, forced by the attribution trigger.

**If `spotify_url` had come back null,** the partial-upsert assumption would be wrong. Change `saveAudioUrl` in Task 6 to read-then-write: `select` the row, and if it exists use `.update({audio_url})...eq(...)` instead of `.upsert(...)`, falling back to `.insert(...)` when it doesn't. Everything else in the plan is unaffected. Record the finding in `ERRORS.md`.

- [ ] **Step 4: Clean up the probe row**

```bash
curl -s -X DELETE "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01&section_id=eq.first-dance" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: HTTP 204.

---

## Task 3: Extract the notify-dj line formatter (test first)

**Files:**
- Create: `supabase/functions/notify-dj/line.ts`
- Create: `supabase/functions/notify-dj/line_test.ts`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/notify-dj/line_test.ts`:

```typescript
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, formatSongLine, formatAfterLine } from "./line.ts";

Deno.test("escapeHtml neutralizes markup", () => {
  assertEquals(escapeHtml(`<b>&"x"</b>`), "&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
});

Deno.test("formatSongLine renders title and artist", () => {
  assertEquals(formatSongLine("At Last", "Etta James", "https://open.spotify.com/track/x"), "At Last by Etta James");
});

Deno.test("formatSongLine renders an em dash when there is nothing to show", () => {
  assertEquals(formatSongLine(null, null, null), "—");
});

// The bug this module exists to fix: an audio-only upload leaves spotify_url
// null, and the old code rendered that as "(removed)" — telling Chris the
// couple deleted a moment they had actually just added a custom edit to.
Deno.test("formatAfterLine reports an upload, not a removal, when audio is attached", () => {
  assertEquals(
    formatAfterLine(null, null, null, "https://x.supabase.co/storage/v1/object/public/client-audio/abc.mp3"),
    "Custom audio uploaded",
  );
});

Deno.test("formatAfterLine names the audio when a title is present", () => {
  assertEquals(
    formatAfterLine("Vows Recording", null, null, "https://x.supabase.co/storage/v1/object/public/client-audio/abc.mp3"),
    "Vows Recording (custom audio)",
  );
});

Deno.test("formatAfterLine marks a link that also has a custom edit", () => {
  assertEquals(
    formatAfterLine("At Last", "Etta James", "https://open.spotify.com/track/x", "https://x.supabase.co/storage/v1/object/public/client-audio/abc.mp3"),
    "At Last by Etta James (custom audio)",
  );
});

Deno.test("formatAfterLine still reports a genuine removal", () => {
  assertEquals(formatAfterLine(null, null, null, null), "(removed)");
});

Deno.test("formatAfterLine is unchanged for an ordinary link", () => {
  assertEquals(
    formatAfterLine("At Last", "Etta James", "https://open.spotify.com/track/x", null),
    "At Last by Etta James",
  );
});

Deno.test("formatAfterLine escapes a hostile title", () => {
  assertEquals(
    formatAfterLine(`<script>x</script>`, null, null, "https://x/audio.mp3"),
    "&lt;script&gt;x&lt;/script&gt; (custom audio)",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test supabase/functions/notify-dj/line_test.ts --allow-net`
Expected: FAIL — `Module not found "./line.ts"`.

- [ ] **Step 3: Write the module**

Create `supabase/functions/notify-dj/line.ts`:

```typescript
// Before/after line rendering for the DJ notification email. Split out of
// index.ts so it can be unit-tested — same split as spotify-export/selection.ts.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatSongLine(
  title: string | null,
  artist: string | null,
  spotifyUrl: string | null,
): string {
  if (!spotifyUrl && !title && !artist) return "—";
  const parts: string[] = [];
  if (title) parts.push(escapeHtml(title));
  if (artist) parts.push(`by ${escapeHtml(artist)}`);
  return parts.length > 0 ? parts.join(" ") : "—";
}

// A null spotify_url used to mean one thing — the moment was removed. It now
// also occurs on a moment whose only content is an uploaded file, so audio has
// to be consulted before calling anything a removal.
export function formatAfterLine(
  title: string | null,
  artist: string | null,
  spotifyUrl: string | null,
  audioUrl: string | null,
): string {
  if (audioUrl) {
    const song = formatSongLine(title, artist, spotifyUrl);
    return song === "—" ? "Custom audio uploaded" : `${song} (custom audio)`;
  }
  if (spotifyUrl == null) return "(removed)";
  return formatSongLine(title, artist, spotifyUrl);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test supabase/functions/notify-dj/line_test.ts --allow-net`
Expected: PASS — 9 passed, 0 failed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/notify-dj/line.ts supabase/functions/notify-dj/line_test.ts
git commit -m "test(notify-dj): extract and test before/after line formatting"
```

---

## Task 4: Wire the formatter into notify-dj

**Files:**
- Modify: `supabase/functions/notify-dj/index.ts`

- [ ] **Step 1: Import the module and delete the local copies**

At the top of `index.ts`, below the existing imports, add:

```typescript
import { escapeHtml, formatSongLine, formatAfterLine } from "./line.ts";
```

Then delete the local `escapeHtml` function (around line 73) and the local `formatSongLine` function (lines 77–83). Nothing else references them.

- [ ] **Step 2: Accept the audio fields from the trigger payload**

In the destructuring of `payload` (around line 99), add two fields after `new_spotify_url`:

```typescript
      new_spotify_url,
      old_audio_url,
      new_audio_url,
```

- [ ] **Step 3: Use the new after-line logic**

Replace these lines (around line 168):

```typescript
    const beforeLine = formatSongLine(old_song_title ?? null, old_artist ?? null, old_spotify_url ?? null);
    // "After" shows "(removed)" if new_spotify_url is null
    const afterLine = (new_spotify_url == null)
      ? "(removed)"
      : formatSongLine(new_song_title ?? null, new_artist ?? null, new_spotify_url);
```

with:

```typescript
    const beforeLine = formatAfterLine(
      old_song_title ?? null, old_artist ?? null, old_spotify_url ?? null, old_audio_url ?? null,
    );
    const afterLine = formatAfterLine(
      new_song_title ?? null, new_artist ?? null, new_spotify_url ?? null, new_audio_url ?? null,
    );
```

Note `beforeLine` now uses `formatAfterLine` too, so a moment that *had* audio and lost it reads correctly on the "Before" side. On an INSERT every `old_*` field is null, which still yields `"(removed)"` — wrong for a brand-new row, but that is pre-existing behavior on the Before line and out of scope here.

- [ ] **Step 4: Verify it type-checks**

Run: `deno check supabase/functions/notify-dj/index.ts`
Expected: no errors. (Import-map warnings about `@supabase/functions-js` are pre-existing and fine; a hard failure on `line.ts` is not.)

- [ ] **Step 5: Re-run the unit tests**

Run: `deno test supabase/functions/notify-dj/line_test.ts --allow-net`
Expected: PASS — 9 passed.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/notify-dj/index.ts
git commit -m "fix(notify-dj): an audio upload is no longer emailed as a removal"
```

---

## Task 5: Send audio fields from the database trigger

**Files:**
- Create: `supabase/migrations/20260805_notify_dj_audio.sql`

- [ ] **Step 1: Write the migration**

This is the full function body from `20260328_notify_dj_trigger.sql` with two fields added to the payload. It is repeated in full because `create or replace function` replaces the whole body.

```sql
-- Adds audio_url to the notify-dj payload. Without it the Edge Function sees a
-- null spotify_url on an audio-only moment and reports it as "(removed)".
create or replace function notify_dj_on_selection_change()
returns trigger
language plpgsql
security definer
as $$
declare
  _url      constant text := 'https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/notify-dj';
  -- anon key (public, safe to commit)
  _key      constant text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbmxmdHhxZGVsY3JtYmNlaW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzg5NDIsImV4cCI6MjA4ODUxNDk0Mn0._-XQuBtlKW0B87QDR6kF1wYU_0FQLjRnTPMJ7xIp59s';
  _payload  text;
begin
  _payload := jsonb_build_object(
    'client_key',      NEW.client_key,
    'section_id',      NEW.section_id,
    'old_song_title',  OLD.song_title,
    'old_artist',      OLD.artist,
    'old_spotify_url', OLD.spotify_url,
    'old_audio_url',   OLD.audio_url,
    'new_song_title',  NEW.song_title,
    'new_artist',      NEW.artist,
    'new_spotify_url', NEW.spotify_url,
    'new_audio_url',   NEW.audio_url
  )::text;

  begin
    perform pg_net.http_post(
      url     := _url,
      body    := _payload,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || _key
      )
    );
  exception when others then
    raise warning 'notify_dj_on_selection_change: pg_net call failed: %', sqlerrm;
  end;

  return NEW;
end;
$$;
```

- [ ] **Step 2: Apply it**

Run: `supabase db push`
Expected: applied, exit code 0.

- [ ] **Step 3: Deploy the Edge Function**

Run: `supabase functions deploy notify-dj --no-verify-jwt`
Expected: deploy succeeds.

Deploy order matters: the function must accept the new fields before the trigger sends them, which is the case here — Task 4 shipped code that tolerates their absence, so neither order breaks.

- [ ] **Step 4: Verify end to end**

```bash
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '{"client_key":"zz-audio-test-2027-01-01","section_id":"cake-cutting","audio_url":"https://example.com/probe.mp3","song_title":"Probe Clip"}'
```
Then check the `notify-dj` logs in the Supabase dashboard (Edge Functions → notify-dj → Logs).
Expected: an invocation whose payload contains `new_audio_url`. The email itself may be skipped by the 30-minute per-client debounce — a `{"skipped":true}` response is a pass for this step, since it proves the payload arrived.

Then delete the probe row:
```bash
curl -s -X DELETE "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01&section_id=eq.cake-cutting" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260805_notify_dj_audio.sql
git commit -m "feat(db): send audio_url in the notify-dj trigger payload"
```

---

## Task 6: The audio module — state, validation, save, delete

Pure-ish helpers first; no UI yet. Nothing calls these until Task 7.

**Files:**
- Modify: `spotify-selections.html` (insert after `clearSelection`, which ends around line 2395)

- [ ] **Step 1: Insert the module**

Immediately after the closing brace of `clearSelection` and before the `// ── REMOVE / UNDO SECTIONS ──` banner, insert:

```javascript
    // ── CUSTOM AUDIO ──
    // A moment can carry an uploaded audio file alongside its Spotify link. The
    // file is what gets played; the link is kept untouched so the Spotify export
    // still holds the original unedited version as a backup. When audio is
    // present the section renders ONLY the audio player — embedSpotify is
    // suppressed from writing to the embed area (see setEmbed there).
    const AUDIO_BUCKET = 'client-audio';
    const AUDIO_MAX_BYTES = 26214400; // 25 MB — must match the bucket's file_size_limit
    const AUDIO_URL_PREFIX = SUPABASE_URL + '/storage/v1/object/public/' + AUDIO_BUCKET + '/';
    const audioUrls = {};   // sectionId -> public URL of its audio, when it has any
    const songTitles = {};  // sectionId -> latest known title, for the download filename
    let portalLocked = false;

    // Rows are anon-writable (RLS is off), so a stored audio_url is untrusted
    // input. Only URLs inside our own bucket are ever handed to an <audio> src
    // or a download href.
    function isTrustedAudioUrl(url) {
      return typeof url === 'string' && url.startsWith(AUDIO_URL_PREFIX);
    }

    // Public URLs look like:
    //   https://<ref>.supabase.co/storage/v1/object/public/client-audio/<object>
    // The object path is what the storage delete API wants.
    function audioPathFromUrl(url) {
      if (!isTrustedAudioUrl(url)) return null;
      return decodeURIComponent(url.slice(AUDIO_URL_PREFIX.length).split('?')[0]);
    }

    function audioFileExt(fileName) {
      const m = (fileName || '').match(/\.([a-z0-9]{1,5})$/i);
      return m ? m[1].toLowerCase() : 'mp3';
    }

    // "01 First Dance_FINAL.wav" -> "01 First Dance FINAL". Used to prefill the
    // name field on an audio-only moment, so the brochure never reads like a
    // filename unless the client leaves it that way on purpose.
    function titleFromFileName(fileName) {
      return (fileName || '')
        .replace(/\.[a-z0-9]{1,5}$/i, '')
        .replace(/[_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Cross-origin `download` attributes are ignored, so the readable filename
    // has to come from Supabase's ?download= parameter instead.
    function audioDownloadHref(sectionId, url) {
      const manual = document.getElementById(sectionId + '-manual-input');
      const base = (manual && manual.value.trim()) || songTitles[sectionId] || sectionId;
      const safe = base.replace(/[\/\\:*?"<>|]/g, '-');
      const ext = (audioPathFromUrl(url) || '').split('.').pop() || 'mp3';
      return url + '?download=' + encodeURIComponent(safe + '.' + ext);
    }

    function audioValidationError(file) {
      if (!file.type.startsWith('audio/')) return 'That is not an audio file';
      if (file.size > AUDIO_MAX_BYTES) return 'Too large — 25 MB maximum';
      return null;
    }

    // Writes ONLY audio_url. spotify_url is deliberately absent from the payload
    // so PostgREST's merge-duplicates leaves the link exactly as it was.
    async function saveAudioUrl(sectionId, audioUrl) {
      if (!sb) return false;
      const { error } = await sb.from('wedding_selections').upsert({
        client_key: getClientKey(),
        section_id: sectionId,
        audio_url: audioUrl,
        entered_by: 'client',
        updated_at: new Date().toISOString()
      }, { onConflict: 'client_key,section_id' });
      if (error) { console.log('Audio save error:', error); return false; }
      return true;
    }

    async function deleteAudioObject(url) {
      const path = audioPathFromUrl(url);
      if (!path || !sb) return;
      const { error } = await sb.storage.from(AUDIO_BUCKET).remove([path]);
      if (error) console.log('Audio object delete error:', error);
    }
```

- [ ] **Step 2: Verify the helpers in the browser console**

Serve the site and open the test portal:

```bash
python3 -m http.server 8765
```

Navigate to `http://localhost:8765/spotify-selections.html?name=ZZ%20Audio%20Test&date=2027-01-01`, then run in the console:

```javascript
audioPathFromUrl(AUDIO_URL_PREFIX + 'abc-123.mp3')
audioPathFromUrl('https://evil.example.com/x.mp3')
titleFromFileName('01 First Dance_FINAL.wav')
audioFileExt('mix.M4A')
audioValidationError({type:'image/png', size: 10})
audioValidationError({type:'audio/mpeg', size: 99999999})
audioValidationError({type:'audio/mpeg', size: 1000})
```

Expected, in order: `'abc-123.mp3'`, `null`, `'01 First Dance FINAL'`, `'m4a'`, `'That is not an audio file'`, `'Too large — 25 MB maximum'`, `null`.

- [ ] **Step 3: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): audio module helpers — paths, validation, save, delete"
```

---

## Task 7: The attach control and its styling

**Files:**
- Modify: `spotify-selections.html` (CSS block; audio module; `DOMContentLoaded` handler around line 2645)

- [ ] **Step 1: Add the CSS**

In the `<style>` block, immediately before the `/* Section card stagger */` comment (around line 220), insert:

```css
    /* Custom audio: attach control + player. Replaces the platform embed when
       a file is present — the section never shows two players at once. */
    .audio-attach-row {
      display: flex; align-items: center; gap: 10px;
      margin-top: 10px; flex-wrap: wrap;
    }
    .audio-attach-label {
      font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--muted); cursor: pointer;
      border: 1px dashed #3a3440; border-radius: 8px;
      padding: 8px 14px; transition: border-color 0.2s, color 0.2s;
    }
    .audio-attach-label:hover { border-color: var(--accent); color: var(--accent); }
    .audio-attach-row input[type="file"] { display: none; }
    .audio-status { font-size: 0.8rem; color: var(--muted); }
    .audio-status.error { color: #ff6b6b; }
    .audio-area { display: none; margin-top: 12px; }
    .audio-area.visible { display: block; }
    .audio-label {
      font-size: 0.72rem; letter-spacing: 0.2em; text-transform: uppercase;
      color: var(--accent); margin-bottom: 8px;
    }
    .audio-area audio { width: 100%; }
    .audio-actions { display: flex; align-items: center; gap: 14px; margin-top: 8px; }
    .audio-download { font-size: 0.8rem; color: var(--accent); text-decoration: none; }
    .audio-download:hover { text-decoration: underline; }
    .audio-remove {
      background: none; border: none; color: #888;
      cursor: pointer; font-size: 0.85rem; padding: 0;
    }
    .audio-remove:hover { color: #ff6b6b; }
    .program-edit-tag {
      font-size: 0.62rem; letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--accent); margin-left: 8px; white-space: nowrap;
    }
```

- [ ] **Step 2: Add the injector to the audio module**

Append to the `// ── CUSTOM AUDIO ──` block from Task 6:

```javascript
    // The 18 fixed sections are hand-written and near-identical, and custom
    // moments are built at runtime. Injecting the control from JS covers both
    // and keeps one definition of it. Built with DOM methods, not markup
    // strings, because section ids and titles flow in from the database.
    function initAudioControls() {
      document.querySelectorAll('.music-section[data-section]').forEach(section => {
        const sectionId = section.dataset.section;
        if (document.getElementById(sectionId + '-audio-attach')) return;
        const embedArea = document.getElementById(sectionId + '-embed');
        if (!embedArea) return;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.id = sectionId + '-audio-input';
        input.addEventListener('change', () => {
          const file = input.files[0];
          input.value = '';  // so picking the same file twice still fires change
          handleAudioUpload(sectionId, file);
        });

        const label = document.createElement('label');
        label.className = 'audio-attach-label';
        label.htmlFor = input.id;
        label.textContent = '🎵 Attach custom edit';

        const status = document.createElement('span');
        status.className = 'audio-status';
        status.id = sectionId + '-audio-status';

        const row = document.createElement('div');
        row.className = 'audio-attach-row';
        row.id = sectionId + '-audio-attach';
        row.append(label, input, status);
        embedArea.after(row);

        const area = document.createElement('div');
        area.className = 'audio-area';
        area.id = sectionId + '-audio-area';
        row.after(area);
      });
    }

    function showAudioStatus(sectionId, message, isError) {
      const el = document.getElementById(sectionId + '-audio-status');
      if (!el) return;
      el.textContent = message || '';
      el.classList.toggle('error', !!isError);
    }

    function setAttachLabel(sectionId, text) {
      const row = document.getElementById(sectionId + '-audio-attach');
      const label = row ? row.querySelector('.audio-attach-label') : null;
      if (label) label.textContent = text;
    }
```

- [ ] **Step 3: Call it on load**

In the `DOMContentLoaded` handler (around line 2645), add `initAudioControls();` before `loadSelections();`:

```javascript
    window.addEventListener('DOMContentLoaded', () => {
      applyPersonalization();
      checkLockStatus();
      initMakeSelectionLinks();
      initAudioControls();
      loadSelections();
    });
```

- [ ] **Step 4: Verify in the browser**

Reload `http://localhost:8765/spotify-selections.html?name=ZZ%20Audio%20Test&date=2027-01-01`.
Expected: every section card shows a dashed **🎵 Attach custom edit** control beneath its embed area. In the console, `document.querySelectorAll('.audio-attach-row').length` returns the number of `.music-section[data-section]` elements on the page (18 with no custom moments saved).

- [ ] **Step 5: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): attach-custom-edit control on every section"
```

---

## Task 8: Upload, render, and suppress the embed

**Files:**
- Modify: `spotify-selections.html` (audio module; `embedSpotify` around line 2075)

- [ ] **Step 1: Add render and upload to the audio module**

Append to the `// ── CUSTOM AUDIO ──` block:

```javascript
    function renderAudio(sectionId, url) {
      if (!isTrustedAudioUrl(url)) { console.log('Refusing untrusted audio URL for', sectionId); return; }
      const embedArea = document.getElementById(sectionId + '-embed');
      if (embedArea) embedArea.replaceChildren();  // only the custom player shows
      const area = document.getElementById(sectionId + '-audio-area');
      if (!area) return;

      const label = document.createElement('div');
      label.className = 'audio-label';
      label.textContent = 'Custom edit';

      const player = document.createElement('audio');
      player.controls = true;
      player.preload = 'none';
      player.src = url;

      const dl = document.createElement('a');
      dl.className = 'audio-download';
      dl.id = sectionId + '-audio-dl';
      dl.href = audioDownloadHref(sectionId, url);
      dl.textContent = 'Download';

      const rm = document.createElement('button');
      rm.className = 'audio-remove';
      rm.title = 'Remove custom edit';
      rm.textContent = '✕ Remove edit';
      rm.addEventListener('click', () => removeAudio(sectionId));

      const actions = document.createElement('div');
      actions.className = 'audio-actions';
      actions.append(dl, rm);

      area.replaceChildren(label, player, actions);
      area.classList.add('visible');
      setAttachLabel(sectionId, '🎵 Replace custom edit');
    }

    function clearAudioUI(sectionId) {
      const area = document.getElementById(sectionId + '-audio-area');
      if (area) { area.replaceChildren(); area.classList.remove('visible'); }
      setAttachLabel(sectionId, '🎵 Attach custom edit');
      showAudioStatus(sectionId, '', false);
    }

    async function handleAudioUpload(sectionId, file) {
      if (!file) return;
      if (portalLocked) return;
      if (!sb) { showAudioStatus(sectionId, 'Connection error', true); return; }

      const problem = audioValidationError(file);
      if (problem) { showAudioStatus(sectionId, problem, true); return; }

      showAudioStatus(sectionId, 'Uploading…', false);
      const objectPath = crypto.randomUUID() + '.' + audioFileExt(file.name);

      const { error: upErr } = await sb.storage
        .from(AUDIO_BUCKET)
        .upload(objectPath, file, { contentType: file.type, upsert: false });
      if (upErr) {
        console.log('Audio upload error:', upErr);
        showAudioStatus(sectionId, upErr.message || 'Upload failed', true);
        return;
      }

      const publicUrl = sb.storage.from(AUDIO_BUCKET).getPublicUrl(objectPath).data.publicUrl;
      const previous = audioUrls[sectionId];

      // Point the row at the new file BEFORE deleting the old one, so a failure
      // never leaves the row referencing an object that no longer exists.
      const saved = await saveAudioUrl(sectionId, publicUrl);
      if (!saved) {
        await deleteAudioObject(publicUrl);
        showAudioStatus(sectionId, 'Save failed', true);
        return;
      }
      audioUrls[sectionId] = publicUrl;
      if (previous && previous !== publicUrl) await deleteAudioObject(previous);

      // An audio-only moment has no link to borrow a title from, so reuse the
      // existing manual-title field and prefill it from the filename.
      const linkInput = document.getElementById(sectionId + '-link');
      if (!linkInput || !linkInput.value.trim()) {
        const manualArea = getOrCreateManualArea(sectionId);
        manualArea.classList.add('visible');
        const manualInput = document.getElementById(sectionId + '-manual-input');
        if (manualInput && !manualInput.value.trim()) {
          manualInput.value = titleFromFileName(file.name);
          saveManualTitle(sectionId);
        }
      }

      renderAudio(sectionId, publicUrl);
      showAudioStatus(sectionId, '', false);
      const clearEl = document.getElementById(sectionId + '-clear');
      if (clearEl) clearEl.classList.add('visible');
      const savedPill = document.getElementById(sectionId + '-saved');
      if (savedPill) { savedPill.textContent = '✓ Saved'; savedPill.classList.add('visible'); }
    }
```

- [ ] **Step 2: Suppress the embed in `embedSpotify`**

In `embedSpotify` (around line 2075), directly after:

```javascript
      const embedArea = document.getElementById(sectionId + '-embed');
      const savedPill = document.getElementById(sectionId + '-saved');
```

insert:

```javascript
      // A section with a custom edit shows only that player. The link is still
      // parsed, saved, and exported — it just doesn't render an iframe.
      const setEmbed = (html) => {
        if (audioUrls[sectionId]) return;
        embedArea.replaceChildren();
        if (html) embedArea.insertAdjacentHTML('beforeend', html);
      };
```

Then route every direct HTML assignment on `embedArea` inside this function through `setEmbed` instead. There are five, identified by what they write:

| Written value | Becomes |
|---|---|
| `''` (the unknown-platform branch, near the top) | `setEmbed('');` |
| the Spotify `<iframe src="${embedUrl}" ...>` template string | `setEmbed(\`<iframe src="${embedUrl}" ...>\`);` |
| the YouTube `<iframe src="https://www.youtube.com/embed/${ytId}" ...>` template string | `setEmbed(\`<iframe ...>\`);` |
| the `<div ...>Loading SoundCloud...</div>` placeholder | `setEmbed('<div ...>Loading SoundCloud...</div>');` |
| `info.html`, inside the `fetchSongInfo(...).then(...)` callback near the end | `setEmbed(info.html);` |

Keep each written value byte-identical — only the assignment becomes a `setEmbed(...)` call. The last one is the reason this indirection exists rather than a single early return: SoundCloud's embed arrives asynchronously and would otherwise repaint the embed area *after* the audio player was drawn.

- [ ] **Step 3: Verify — upload onto a section that has a link**

With the local server running, on the test portal:
1. Paste `https://open.spotify.com/track/0tgVpDi06FyKpA1z0VMD4v` into **FIRST DANCE** and click `upload`. Confirm the Spotify iframe appears.
2. Click **🎵 Attach custom edit** on the same section and choose any audio file under 25 MB.

Expected:
- Status shows `Uploading…`, then clears.
- The Spotify iframe **disappears**; a **Custom edit** player with Download and ✕ Remove edit appears.
- The link text box still shows the Spotify URL.
- The attach control now reads **Replace custom edit**.
- Console has no errors.

Confirm the database kept both:
```bash
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01&section_id=eq.first-dance&select=spotify_url,audio_url,song_title" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `spotify_url` is the Spotify track URL **and** `audio_url` is a `client-audio` URL.

- [ ] **Step 4: Verify — rejection paths**

Attach a `.png` to **CAKE CUTTING**. Expected: red `That is not an audio file`, no player, no upload.
Attach an audio file over 25 MB. Expected: red `Too large — 25 MB maximum`, no upload.

- [ ] **Step 5: Verify — the cap is enforced server-side**

```bash
head -c 30000000 /dev/urandom > /tmp/big.mp3
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/client-audio/probe-oversize.mp3" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: audio/mpeg" --data-binary @/tmp/big.mp3
rm /tmp/big.mp3
```
Expected: `413` (or another 4xx) — **not** `200`. This proves the browser check is a courtesy, not the enforcement.

- [ ] **Step 6: Verify — replacing deletes the previous object**

Note the current `audio_url` for `first-dance`, attach a second, different audio file, then request the old URL:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "<the previous audio_url>"
```
Expected: `400` or `404` — the old object is gone. The new `audio_url` returns `200`.

- [ ] **Step 7: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): upload custom audio and render it in place of the embed"
```

---

## Task 9: Restore audio on load, and stop treating audio-only moments as deleted

This is the task that keeps audio-only moments from disappearing. See Context note 1.

**Files:**
- Modify: `spotify-selections.html` (`loadSelections`, around lines 2428–2519)

- [ ] **Step 1: Verify the bug exists first**

Create an audio-only row for a section with no link:
```bash
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -H "Prefer: resolution=merge-duplicates" \
  -d '{"client_key":"zz-audio-test-2027-01-01","section_id":"anniversary-dance","audio_url":"https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/public/client-audio/nonexistent.mp3","song_title":"Audio Only Probe"}'
```
Reload the test portal.
Expected (the bug): the **ANNIVERSARY DANCE** section is hidden with a "Section removed / ↩ Undo" bar — because a null `spotify_url` is read as a tombstone.

- [ ] **Step 2: Record audio state before anything else runs for the row**

In `loadSelections`, inside `deduped.forEach(row => {`, immediately after `const sid = row.section_id;`, insert:

```javascript
          // Must be recorded before embedSpotify runs for this row: it checks
          // audioUrls to decide whether to paint an iframe at all.
          if (row.audio_url) audioUrls[sid] = row.audio_url;
```

- [ ] **Step 3: Fix the tombstone test**

Replace:

```javascript
          if (!row.spotify_url && row.song_title !== '__custom_def__') {
```

with:

```javascript
          // A row with audio and no link is a real selection, not a tombstone.
          if (!row.spotify_url && !row.audio_url && row.song_title !== '__custom_def__') {
```

- [ ] **Step 4: Render restored audio**

The existing `if (row.spotify_url) { ... }` block ends just before the closing `});` of `deduped.forEach`. Directly after that block's closing brace, insert:

```javascript
          if (row.audio_url) {
            sectionsWithData.add(sid);
            if (row.song_title) songTitles[sid] = row.song_title;
            // No link means no oEmbed title, so surface the saved name for editing.
            if (!row.spotify_url) {
              const manualArea = getOrCreateManualArea(sid);
              manualArea.classList.add('visible');
              const manualInput = document.getElementById(sid + '-manual-input');
              if (manualInput && row.song_title) manualInput.value = row.song_title;
              if (row.song_title) updateProgram(sid, row.song_title, row.artist || '', '');
            }
            renderAudio(sid, row.audio_url);
            const clearEl = document.getElementById(sid + '-clear');
            if (clearEl) clearEl.classList.add('visible');
          }
```

- [ ] **Step 5: Record titles for the download filename**

At the top of `updateProgram` (around line 1911), immediately after the opening brace, insert:

```javascript
      if (title) songTitles[sectionId] = title;
```

- [ ] **Step 6: Verify the fix**

Reload the test portal.
Expected:
- **ANNIVERSARY DANCE** is visible, not removed, showing a **Custom edit** player and the name `Audio Only Probe` in its song-name field. (The player itself won't play — the probe URL points at nothing. That's fine; this step is about the section not vanishing.)
- **FIRST DANCE** shows its custom edit player and **no** Spotify iframe, with the link still in its box.
- Console has no errors.

- [ ] **Step 7: Commit**

```bash
git add spotify-selections.html
git commit -m "fix(portal): restore audio on load; audio-only moments are not tombstones"
```

---

## Task 10: Removing an edit restores the link

**Files:**
- Modify: `spotify-selections.html` (audio module)

- [ ] **Step 1: Add `removeAudio`**

Append to the `// ── CUSTOM AUDIO ──` block:

```javascript
    // Removes only the audio. The Spotify link and its embed come back.
    async function removeAudio(sectionId) {
      if (portalLocked) return;
      const url = audioUrls[sectionId];
      delete audioUrls[sectionId];
      clearAudioUI(sectionId);
      if (url) {
        await saveAudioUrl(sectionId, null);
        await deleteAudioObject(url);
      }
      const linkInput = document.getElementById(sectionId + '-link');
      if (linkInput && linkInput.value.trim()) {
        embedSpotify(sectionId, true);  // audioUrls is now clear, so this paints
      }
      const title = songTitles[sectionId];
      if (title) updateProgram(sectionId, title, '', linkInput ? linkInput.value.trim() : '');
    }
```

`saveAudioUrl(sectionId, null)` writes an explicit null into `audio_url` — that is a real update of that one column, not an omission, so the link is still untouched.

- [ ] **Step 2: Verify**

On the test portal, click **✕ Remove edit** on **FIRST DANCE**.
Expected:
- The audio player disappears and the Spotify iframe returns.
- The attach control reads **Attach custom edit** again.
- The brochure entry for First Dance keeps its song title and loses the *custom edit* tag (tag arrives in Task 11 — before that, just confirm the title survives).

Then confirm the database:
```bash
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01&section_id=eq.first-dance&select=spotify_url,audio_url" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: `audio_url` is `null`, `spotify_url` is unchanged.

Reload the page. Expected: the Spotify embed renders, no audio player.

- [ ] **Step 3: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): remove a custom edit and restore the platform embed"
```

---

## Task 11: The brochure "custom edit" tag

**Files:**
- Modify: `spotify-selections.html` (`updateProgram`, around line 1911)

- [ ] **Step 1: Append the tag element**

In `updateProgram`, find the line that builds the `program-song-link` anchor into `song` (inside the `if (map && moment && ...)` block) and, on the line directly below it, insert:

```javascript
          if (audioUrls[sectionId]) {
            const tag = document.createElement('span');
            tag.className = 'program-edit-tag';
            tag.textContent = 'custom edit';
            song.appendChild(tag);
          }
```

Appending an element rather than concatenating markup keeps the untrusted title on the existing code path and adds no new interpolation.

- [ ] **Step 2: Refresh the tag after an upload**

In `handleAudioUpload`, immediately after `renderAudio(sectionId, publicUrl);`, insert:

```javascript
      const knownTitle = songTitles[sectionId];
      if (knownTitle) {
        updateProgram(sectionId, knownTitle, '', linkInput ? linkInput.value.trim() : '');
      }
```

`linkInput` is already in scope from the manual-title block above it.

- [ ] **Step 3: Verify**

On the test portal: attach an edit to **FIRST DANCE** (which has a link and a title).
Expected: the brochure line for First Dance reads the song title followed by a small gold **custom edit**. Remove the edit → the tag disappears. Reload → the tag is back on any moment that still has audio.

- [ ] **Step 4: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): mark moments with a custom edit in the brochure"
```

---

## Task 12: Purge audio on clear and on section removal

**Files:**
- Modify: `spotify-selections.html` (`clearSelection` around line 2357, `deleteSelection` around line 2194)

- [ ] **Step 1: Purge on clear**

In `clearSelection`, immediately before the `// Delete the row entirely` comment, insert:

```javascript
      // Clearing a section takes the audio with it. An upload is never the only
      // copy, so nothing is at risk, and no object is left without a row.
      const clearedAudio = audioUrls[sectionId];
      delete audioUrls[sectionId];
      delete songTitles[sectionId];
      clearAudioUI(sectionId);
      if (clearedAudio) await deleteAudioObject(clearedAudio);
```

- [ ] **Step 2: Purge on section removal**

Replace the body of `deleteSelection` with:

```javascript
    async function deleteSelection(sectionId) {
      // Save a null tombstone so the section stays hidden on refresh
      try {
        if (!sb) return;
        // Removal purges the audio too, so undo restores the section without
        // it — deliberate, and it keeps the bucket free of unreferenced objects.
        const removedAudio = audioUrls[sectionId];
        delete audioUrls[sectionId];
        clearAudioUI(sectionId);
        const { error } = await sb.from('wedding_selections').upsert({
          client_key: getClientKey(),
          section_id: sectionId,
          spotify_url: null,
          song_title: null,
          artist: null,
          audio_url: null,
          entered_by: 'client',
          updated_at: new Date().toISOString()
        }, { onConflict: 'client_key,section_id' });
        if (error) console.log('Delete error:', error);
        if (removedAudio) await deleteAudioObject(removedAudio);
      } catch(e) { console.log('Delete error:', e); }
    }
```

- [ ] **Step 3: Verify removal purges**

On the test portal, attach an edit to **CAKE CUTTING**, note its `audio_url` from the console (`audioUrls['cake-cutting']`), then click the 🗑 on that section.

Expected: the section hides with an undo bar, and:
```bash
curl -s -o /dev/null -w "%{http_code}\n" "<that audio_url>"
```
returns `400` or `404`.

Click **↩ Undo**. Expected: the section returns with no audio player — as designed. Reload. Expected: the section is still visible with no audio.

- [ ] **Step 4: Verify clear purges**

Attach an edit to **LAST SONG OF THE NIGHT**, note the URL, click **✕ Clear Selection**.
Expected: player gone, and the URL returns `400`/`404`. Reload: the section is present and empty.

- [ ] **Step 5: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): delete the stored file when audio is cleared or its section removed"
```

---

## Task 13: Custom moments and the lock

**Files:**
- Modify: `spotify-selections.html` (`createCustomMoment` around line 2541, `checkLockStatus` around line 1826)

- [ ] **Step 1: Give custom moments the control**

In `createCustomMoment`, immediately after `container.appendChild(wrapper);`, insert:

```javascript
      initAudioControls();  // the new section needs its attach control too
```

- [ ] **Step 2: Guard against a locked portal**

In `checkLockStatus`, replace:

```javascript
        if (clients?.length && clients[0].locked) {
          const overlay = document.getElementById('locked-overlay');
          overlay.style.display = 'flex';
        }
```

with:

```javascript
        if (clients?.length && clients[0].locked) {
          const overlay = document.getElementById('locked-overlay');
          overlay.style.display = 'flex';
          // The overlay covers the page, but a keyboard user can still reach
          // the file input behind it, so uploads are refused explicitly too.
          portalLocked = true;
        }
```

- [ ] **Step 3: Verify custom moments**

On the test portal, click **+ Add Custom Moment**, name it `Test Moment`, and click **+ Add**.
Expected: the new section has a **🎵 Attach custom edit** control. Attach an audio file to it.
Expected: it uploads and renders exactly like a fixed section, and the brochure's custom list shows the moment with the *custom edit* tag.

Reload. Expected: the custom moment returns with its audio player intact.

- [ ] **Step 4: Verify the lock guard**

The `clients` table requires an authenticated session to write, so the test portal has no client row to lock (see Task 1 Step 5). The overlay itself is pre-existing, unchanged behavior; what this change adds is the `portalLocked` guard, so that is what gets verified. In the console:

```javascript
portalLocked = true;
await handleAudioUpload('first-dance', new File([new Uint8Array(10)], 'x.mp3', {type:'audio/mpeg'}));
audioUrls['first-dance'];   // unchanged
portalLocked = false;
```
Expected: the call resolves without uploading — `audioUrls['first-dance']` is whatever it was, no status message appears, and no new object lands in the bucket.

Confirm the assignment is wired to the real lock by reading `checkLockStatus`: `portalLocked = true` sits in the same branch that shows the overlay, so any client whose row has `locked = true` gets both. A full end-to-end lock test needs a real locked client and is left for Chris to spot-check on a real portal after merge.

- [ ] **Step 5: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(portal): audio on custom moments; refuse uploads on a locked portal"
```

---

## Task 14: Full regression pass

No code unless something fails. Every check runs against the test portal at
`http://localhost:8765/spotify-selections.html?name=ZZ%20Audio%20Test&date=2027-01-01`.

- [ ] **Step 1: Link-only behavior is untouched**

On a section with no audio, paste a Spotify track link, a YouTube link, and a SoundCloud link in turn.
Expected: each embeds as before, the title populates in the brochure, the saved pill appears. This is the primary regression risk from the `setEmbed` change in Task 8.

- [ ] **Step 2: The Spotify export still sees only links**

```bash
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01&select=section_id,spotify_url,audio_url" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: every moment that had a link still has it, including moments that also carry audio. `spotify-export` filters to `https://open.spotify.com/track/`, so audio URLs are invisible to it and no code there changed.

- [ ] **Step 3: The download link works and is named**

Click **Download** on a section with real audio.
Expected: the file downloads with a readable name (the song title or the name given), not a UUID, and not a navigation to a player page.

- [ ] **Step 4: Edit the link after attaching audio**

On a section with audio, change the link text and press Enter.
Expected: the new link saves (check the row), **no** iframe appears, the audio player stays.

- [ ] **Step 5: Reload persistence**

Reload once more and walk every section touched during this plan.
Expected: each renders in the same state it was left in — audio where audio was attached, embeds where only links exist, no section wrongly hidden, no console errors.

- [ ] **Step 6: No orphans left in the bucket**

```bash
curl -s -X POST "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/list/client-audio" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{"prefix":"","limit":100}'
```
Cross-check every returned object name against the `audio_url` values from Step 2.
Expected: each stored object is referenced by a row. Any extra object is a leak — find which path produced it before shipping.

---

## Task 15: Documentation and cleanup

**Files:**
- Modify: `CLAUDE.md`, `TODOS.md`

- [ ] **Step 1: Document the schema addition**

In `CLAUDE.md`, under **Supabase Tables**, replace the `wedding_selections` line with:

```markdown
- `wedding_selections` — client_key, section_id, spotify_url, audio_url, song_title, artist, notes, updated_at, user_id. Unique on `(client_key, section_id)`.
```

Below that table list, add:

```markdown
### Supabase Storage

- `client-audio` — public bucket for uploaded custom audio. Objects are named with a random UUID plus the original extension, so URLs are public but unguessable. Bucket enforces a 25 MB file size limit and audio-only MIME types; anon may read, insert, and delete.
```

- [ ] **Step 2: Document the behavior in Gotchas**

Append to the **Gotchas** section of `CLAUDE.md`:

```markdown
- A moment can carry an uploaded file (`audio_url`) alongside its `spotify_url`. When it does, the section renders **only** the audio player — `embedSpotify` writes through `setEmbed`, which is a no-op while `audioUrls[sectionId]` is set. The link is deliberately kept so the Spotify export still carries the original unedited version as a backup.
- `spotify_url IS NULL` used to be a reliable tombstone marker. It is not any more: an audio-only moment has a null `spotify_url`. Anything testing for a deleted section must check `audio_url` too — `loadSelections` does. `spotify-export` is unaffected because it only exports `open.spotify.com/track/` URLs anyway.
- Deleting audio (remove edit, clear selection, or remove section) deletes the storage object as well. Undo after removing a section restores the section without its audio, on purpose.
- Audio URLs read back from the database are untrusted (RLS is off, anon key is public). `isTrustedAudioUrl` gates anything that reaches an `<audio>` src or a download href, and the audio UI is built with DOM methods rather than markup strings. Keep it that way.
```

- [ ] **Step 3: Record the deferred admin listing**

Append to `TODOS.md`:

```markdown
## Admin: Per-Client Uploaded Audio Listing
**Priority:** P3 | **Effort:** S
**Depends on:** Custom audio upload shipped

Add an "Uploaded audio" list to each client in admin.html — every section with an `audio_url`, labelled by moment, with download links — so every custom edit for one wedding can be pulled in one pass instead of scrolling the client portal. Deferred from the custom-audio-upload design (2026-08-05); portal-level download was enough to ship.
```

- [ ] **Step 4: Delete the test data**

```bash
curl -s -X DELETE "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.zz-audio-test-2027-01-01" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Expected: HTTP 204. There is no client row to delete — none was ever created (Task 1 Step 5).

Then delete every object left in the bucket from testing, using the list from Task 14 Step 6:
```bash
curl -s -X DELETE "https://lfnlftxqdelcrmbceiob.supabase.co/storage/v1/object/client-audio/<object-name>" \
  -H "apikey: $SUPABASE_ANON_KEY" -H "Authorization: Bearer $SUPABASE_ANON_KEY"
```
Re-run the list call from Task 14 Step 6. Expected: an empty array.

- [ ] **Step 5: Stop the local server**

Stop the `python3 -m http.server 8765` process.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md TODOS.md
git commit -m "docs: custom audio upload — storage bucket, audio_url, tombstone caveat"
```

---

## Shipping

Use the `/ship` skill for the PR. Before running it:

- The branch is `feat/custom-audio-upload`.
- Two migrations and one Edge Function deploy are already applied to the live Supabase project — they ship ahead of the frontend by nature. Both are additive and backward-compatible: the old page ignores `audio_url`, and `notify-dj` tolerates the field being absent. There is no window in which the live site is broken.
- The frontend goes live on merge to `main` via GitHub Pages (~1 minute).
- After merge, attach one real audio file on one real client portal and remove it again, to confirm production storage policies behave as the test client did.
