# Email Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an email to chris@chiduly.com whenever a client saves or updates a wedding music selection, debounced to one email per client per 30 minutes, showing a full diff of what changed.

**Architecture:** A Postgres trigger on `wedding_selections` fires on every INSERT/UPDATE and calls a new `notify-dj` Supabase Edge Function via `pg_net`. The Edge Function checks `clients.last_notified_at` for the 30-minute debounce, then sends via Resend and updates the timestamp.

**Tech Stack:** Supabase Postgres (pg_net extension), Deno Edge Functions, Resend API, SQL migrations

---

### Task 1: Add `last_notified_at` column to `clients`

**Files:**
- Create: `supabase/migrations/20260327_add_last_notified_at.sql`

Add a nullable `timestamptz` column `last_notified_at` to the `clients` table. This column tracks when the last notification email was sent for each client and is the sole mechanism for the 30-minute debounce check. Follow the exact pattern of the existing migration `supabase/migrations/20260326_add_clients_deleted_at.sql` — use `alter table if exists` and `add column if not exists`.

- [ ] Create the migration file with the `ALTER TABLE` statement adding `last_notified_at timestamptz` to `public.clients`
- [ ] Apply the migration: `supabase db push`
- [ ] Verify in Supabase dashboard that the column exists on the `clients` table with no default value and nullable
- [ ] Commit: `feat(db): add last_notified_at column to clients for notification debounce`

---

### Task 2: Create Postgres trigger to call `notify-dj` on selection changes

**Files:**
- Create: `supabase/migrations/20260327_notify_dj_trigger.sql`

This migration does three things: (1) stores the Edge Function URL and service role key as Postgres `app.settings` so the trigger function can read them without hardcoding, (2) creates a PL/pgSQL trigger function that calls `pg_net.http_post()` to the `notify-dj` Edge Function URL with a JSON payload containing `client_key`, `section_id`, and old/new `spotify_url`, `song_title`, `artist` values, and (3) attaches that function as an `AFTER INSERT OR UPDATE` trigger on `wedding_selections`. The `pg_net` extension is already enabled on all Supabase projects. The service role key is read via `current_setting('app.settings.service_role_key')` inside the trigger function.

The Edge Function URL follows the pattern: `https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/notify-dj`

The JSON payload shape sent to the Edge Function:
- `client_key` — text
- `section_id` — text
- `old_song_title` — text (nullable, from `OLD.song_title`)
- `old_artist` — text (nullable, from `OLD.artist`)
- `old_spotify_url` — text (nullable, from `OLD.spotify_url`)
- `new_song_title` — text (nullable, from `NEW.song_title`)
- `new_artist` — text (nullable, from `NEW.artist`)
- `new_spotify_url` — text (nullable, from `NEW.spotify_url`)

On INSERT, `OLD` fields are null (no previous row). The trigger function should handle this gracefully — null old values simply mean it's a new selection.

- [ ] Create the migration file with the `ALTER DATABASE` statements to set `app.settings.edge_function_url` and `app.settings.service_role_key` — replace `<SERVICE_ROLE_KEY>` with the actual key from the Supabase dashboard (Project Settings → API → service_role key)
- [ ] Add the trigger function (`notify_dj_on_selection_change()`) that builds the JSON payload and calls `pg_net.http_post()` with `Content-Type: application/json` and `Authorization: Bearer <service_role_key>` headers
- [ ] Add the trigger attachment: `CREATE OR REPLACE TRIGGER notify_dj_trigger AFTER INSERT OR UPDATE ON wedding_selections FOR EACH ROW EXECUTE FUNCTION notify_dj_on_selection_change()`
- [ ] Apply the migration: `supabase db push`
- [ ] Verify trigger exists in Supabase dashboard under Database → Triggers
- [ ] Commit: `feat(db): add Postgres trigger to call notify-dj edge function on selection changes`

---

### Task 3: Create `notify-dj` Edge Function

**Files:**
- Create: `supabase/functions/notify-dj/index.ts`
- Create: `supabase/functions/notify-dj/deno.json`

Model this function after `supabase/functions/send-reply-email/index.ts` — same imports, same CORS headers, same Resend API call pattern, same brand styling (gold `#a07840` accent, serif font, warm cream blockquote). The function receives the payload from the Postgres trigger, looks up the client by `client_key` using the Supabase service role client, checks `last_notified_at` for the 30-minute debounce, and if cleared: sends the email and updates `last_notified_at`.

**Debounce logic:** If `last_notified_at` is not null and `(now - last_notified_at) < 30 minutes`, return `200 OK` with `{ skipped: true }`. Do not send an email. If `last_notified_at` is null or >= 30 minutes ago, proceed.

**`last_notified_at` update:** Update AFTER a successful Resend API call. If Resend fails, do not update `last_notified_at` so the next save retries.

**Section ID label map** — hardcode this lookup in the function:

| section_id | Display Label |
|---|---|
| guest-seating | Guest Seating |
| wedding-party-walk | Wedding Party Walk |
| bride-walk | Bride Walk |
| the-kiss | The Kiss |
| ceremony-exit | Ceremony Exit |
| party-entrance | Wedding Party Entrance |
| grand-entrance | Grand Entrance |
| announcement | Grand Entrance Announcement |
| first-dance | First Dance |
| father-daughter | Father/Daughter Dance |
| mother-son | Mother/Son Dance |
| anniversary-dance | Anniversary Dance |
| last-song | Last Song of the Night |
| cake-cutting | Cake Cutting |
| bouquet-toss | Bouquet Toss |
| dance-floor | Dance Floor Must Plays |
| last-dance | Last Dance (Private) |
| additional-notes | Additional Notes |
| admin-reply | Admin Reply |

For section IDs ending in `-notes` (e.g. `first-dance-notes`), strip the suffix, look up the base section, and append "Notes" — e.g. "First Dance Notes". For `custom-def-{id}` IDs, label as "Custom Moment Definition". Unknown IDs fall back to the raw `section_id`.

**Email subject:** `{Client Name} updated their music — {Moment Label}`

**Email body** (HTML, inline styles):
- Header: "Chi Duly Productions" in gold (`#a07840`), subheader "Wedding Music Program" in muted purple
- Thin HR divider
- Body text: `{Client Name} made a change to their music program.` then `Wedding Date: {formatted date e.g. "May 9, 2026"}`
- Change block styled as a blockquote (border-left gold, background `#faf6f1`):
  - Moment label in bold caps
  - `Before: "{song_title}" — {artist}` — if old values are null/empty, show an em dash (`—`)
  - `After: "{song_title}" — {artist}` — if `new_spotify_url` is null, show "(removed)"
- "View their portal →" link to `https://chidulydesigns.us/admin.html` (admin dashboard)
- Footer HR + copyright

**`deno.json`:** Copy exactly from `supabase/functions/send-reply-email/deno.json`.

**Env vars used:**
- `RESEND_API_KEY` — already set as a Supabase secret
- `SUPABASE_URL` — auto-injected by Supabase Edge Function runtime
- `SUPABASE_SERVICE_ROLE_KEY` — auto-injected by Supabase Edge Function runtime

- [ ] Create `supabase/functions/notify-dj/deno.json` by copying from `supabase/functions/send-reply-email/deno.json`
- [ ] Create `supabase/functions/notify-dj/index.ts` with the full function implementation as described above
- [ ] Deploy the function: `supabase functions deploy notify-dj --no-verify-jwt`
- [ ] Confirm deployment succeeded in Supabase dashboard under Edge Functions
- [ ] Commit: `feat(edge-fn): add notify-dj edge function for DJ email notifications`

---

### Task 4: End-to-end test and verification

**Files:** None — manual testing only

Verify the full flow works in production by making a real selection change and confirming the email arrives. Also verify the debounce works by making two rapid changes.

- [ ] Open the admin dashboard at `https://chidulydesigns.us/admin.html` and find a test client (or create one)
- [ ] Open the client's portal link and save a song to any section
- [ ] Wait up to 30 seconds, then check `chris@chiduly.com` inbox for the notification email — confirm it contains the correct client name, moment label, and before/after diff
- [ ] Make a second change to the same client's portal immediately after — confirm NO second email arrives (debounce working)
- [ ] Wait 30 minutes and make a third change — confirm a new email arrives
- [ ] Check Supabase Edge Function logs (dashboard → Edge Functions → notify-dj → Logs) to confirm no errors
- [ ] Commit: `test: verify email notifications end-to-end`
