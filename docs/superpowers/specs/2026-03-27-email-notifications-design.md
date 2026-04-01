# Email Notifications — Design Spec

**Date:** 2026-03-27
**Project:** Wedding Music Site — Chi Duly Productions
**Feature:** Notify the DJ when a client saves or updates a music selection

---

## Overview

When a client saves any change to their wedding music selections, an email notification is sent to `chris@chiduly.com`. Notifications are debounced per client — at most one email per client per 30 minutes. The email shows a full diff (before vs. after) for the triggering change.

---

## Architecture

Three pieces:

1. **Migration** — adds `last_notified_at timestamptz` column to the `clients` table
2. **Postgres trigger** — fires on `INSERT OR UPDATE` on `wedding_selections`, calls the Edge Function via `pg_net` with old + new row data and the `client_key`
3. **Edge Function: `notify-dj`** — checks debounce, sends email via Resend, updates `last_notified_at`

### Data Flow

```
Client saves selection
  → Postgres trigger fires (has OLD + NEW row)
  → pg_net HTTP POST → notify-dj edge function
  → function looks up client by client_key
  → checks clients.last_notified_at
  → if < 30 min ago: exit silently (debounced)
  → if >= 30 min ago (or null):
      → send email to chris@chiduly.com via Resend
      → update clients.last_notified_at = now()
```

---

## Database Migration

```sql
ALTER TABLE clients ADD COLUMN last_notified_at timestamptz;
```

---

## Postgres Trigger

- Fires: `AFTER INSERT OR UPDATE ON wedding_selections`
- For each row: calls `pg_net.http_post()` to the `notify-dj` Edge Function URL
- Payload includes:
  - `client_key`
  - `section_id`
  - `old_spotify_url`, `old_song_title`, `old_artist`
  - `new_spotify_url`, `new_song_title`, `new_artist`
- Uses the Supabase service role key in the Authorization header, stored as a Postgres `app.settings.service_role_key` config value set via migration so the trigger function can read it with `current_setting('app.settings.service_role_key')`

---

## Edge Function: `notify-dj`

**Runtime:** Deno (matches existing `send-reply-email` pattern)

**Logic:**

1. Parse request body for `client_key`, `section_id`, old/new values
2. Query `clients` table for `name`, `wedding_date`, `last_notified_at` where `client_key` matches
3. If no client found: exit silently
4. If `last_notified_at` is within 30 minutes of now: exit silently (debounced)
5. Build and send email via Resend API
6. Update `clients.last_notified_at = now()`

**Env vars required:**
- `RESEND_API_KEY` (already set)
- `SUPABASE_URL` (already available in Edge Function runtime)
- `SUPABASE_SERVICE_ROLE_KEY`

---

## Email Format

**To:** `chris@chiduly.com`
**From:** `Chi Duly Productions <notifications@send.chiduly.com>`
**Subject:** `{Client Name} updated their music — {Moment Label}`

**Body (HTML, matches existing brand styling):**

```
Chi Duly Productions
Wedding Music Program
─────────────────────

{Client Name} made a change to their music program.
Wedding Date: {formatted date}

{MOMENT LABEL}
  Before: "{song title}" — {artist}   (or "—" if no prior value)
  After:  "{song title}" — {artist}   (or "(removed)" if tombstone)

─────────────────────
View their portal →  [admin dashboard link]

© 2026 Chi Duly Productions
```

**Section ID → Label mapping** (in Edge Function):

| section_id | Label |
|---|---|
| `guest-seating` | Guest Seating |
| `wedding-party-walk` | Wedding Party Walk |
| `bride-walk` | Bride Walk |
| `the-kiss` | The Kiss |
| `ceremony-exit` | Ceremony Exit |
| `party-entrance` | Wedding Party Entrance |
| `grand-entrance` | Grand Entrance |
| `announcement` | Grand Entrance Announcement |
| `first-dance` | First Dance |
| `father-daughter` | Father/Daughter Dance |
| `mother-son` | Mother/Son Dance |
| `anniversary-dance` | Anniversary Dance |
| `last-song` | Last Song of the Night |
| `cake-cutting` | Cake Cutting |
| `bouquet-toss` | Bouquet Toss |
| `dance-floor` | Dance Floor Must Plays |
| `last-dance` | Last Dance (Private) |
| `additional-notes` | Additional Notes |
| `admin-reply` | Admin Reply |
| `{section}-notes` | {Section} Notes |
| `custom-def-{id}` | Custom Moment Definition |

Unknown section IDs fall back to the raw `section_id`.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `pg_net` HTTP call fails | Silent failure — no retry. Low-stakes miss. |
| Resend API fails | Log error, do NOT update `last_notified_at` (next save will retry) |
| `client_key` not found in `clients` | Exit silently |
| Tombstone row (`spotify_url = null`) | Show "After: (removed)" in email |
| `__custom_def__` row | Label as "Custom Moment Definition" |
| `admin-reply` write | Notifies normally (all changes are notified) |

---

## Files to Create/Modify

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_add_last_notified_at.sql` | Create — adds column |
| `supabase/migrations/YYYYMMDD_notify_dj_trigger.sql` | Create — trigger + pg_net call |
| `supabase/functions/notify-dj/index.ts` | Create — Edge Function |
| `supabase/functions/notify-dj/deno.json` | Create — matches send-reply-email pattern |

---

## Out of Scope

- Retry logic for failed Resend calls
- Configurable notification email in admin UI (hardcoded to `chris@chiduly.com`)
- Batching multiple changes into one email (debounce window covers this sufficiently)
- Spotify export feature (separate TODO)
