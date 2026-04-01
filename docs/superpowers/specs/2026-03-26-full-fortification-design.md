# Full Fortification — Implementation Spec

**Date:** 2026-03-26
**Branch:** main
**Status:** APPROVED
**Upstream design:** `~/.gstack/projects/chidulyproductions-wedding-client-portal/chiduly-main-design-20260325-113831.md`

## Overview

Fortify the Wedding Music Site to production-grade reliability without rebuilding. Three phases: data reliability, security, UX reliability. 18 work items across 4 files + Supabase Dashboard config.

## Constraints

1. Static HTML on GitHub Pages — no build step, no SSR
2. No new frameworks or dependencies (Supabase JS SDK already loaded via CDN)
3. Must not break existing client data or URLs
4. Supabase settings (RLS, policies, user metadata) can be modified
5. The Next.js rebuild is a separate future project

## Architecture Change: Shared Utils

**New file: `js/fortify-utils.js`**

Loaded via `<script src="js/fortify-utils.js"></script>` in both `spotify-selections.html` and `admin.html`, placed before their inline `<script>` blocks. Contains all shared fortification infrastructure.

### `reliableSave(sb, table, data, conflictKeys, options)`

The core save wrapper. Every Supabase write in the app goes through this function.

```
Parameters:
  sb           — Supabase client instance
  table        — Table name (e.g., 'wedding_selections')
  data         — Object to upsert/update
  conflictKeys — String for onConflict (e.g., 'client_key,section_id'), or null for update-only
  options      — {
    feedbackEl:    DOM element for the saved pill (optional)
    sectionEl:     DOM element for the section card (optional, for border flash)
    verifyFields:  Array of field names for read-after-write (optional)
    selectMatch:   Object of {column: value} for read-back query and for .update().match()
    mode:          'upsert' (default) | 'update' — controls whether to use .upsert() or .update().match()
  }

Returns: { success: boolean, data: object|null, error: object|null }
```

**Behavior:**
1. If offline, delegate to `offlineQueue.enqueue()`, return `{success: true, queued: true}`
2. Attempt upsert via `sb.from(table).upsert(data, {onConflict: conflictKeys})`
3. On failure, retry up to 3 times with 1s, 2s, 4s backoff
4. During retries, update `feedbackEl` text: "Saving..." then "Retrying (2/3)..." then "Retrying (3/3)..."
5. On success, green border flash on `sectionEl` (1.5s), pill shows "Saved" for 3s
6. On success (first save per session), read-after-write: `sb.from(table).select().match(selectMatch).single()`, compare `verifyFields`. If mismatch, treat as failure.
7. On failure after retries, red border on `sectionEl`, call `showBanner('error', '...')`, update `beforeunloadGuard`

**Session tracking:** Module-level `let firstSaveVerified = false`. After first successful read-after-write, set to `true`. Subsequent saves skip verification unless the SDK returns an error, which resets the flag.

### `reliableDelete(sb, table, match, options)`

Same retry + feedback pattern as `reliableSave`, but uses `sb.from(table).delete().match(match)`. Used for `clearSelection()` and admin delete client.

### `offlineQueue`

Singleton object managing offline save queueing.

```
offlineQueue.init(sb)           — Start monitoring, set up listeners
offlineQueue.enqueue(op)        — Add {table, data, conflictKeys} to queue
offlineQueue.flush()            — Deduplicate by (client_key, section_id), send in order
offlineQueue.hasPending()       — Returns boolean
offlineQueue.count()            — Returns number of queued ops
```

**Storage format:** `localStorage.setItem('fortify_queue', JSON.stringify({queue: [...], version: 1}))`

**Monitoring:**
- `window.addEventListener('online', ...)` and `window.addEventListener('offline', ...)`
- Conditional heartbeat: `HEAD` to `https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/` every 30s, only when `navigator.onLine === true` AND a previous request failed. Stop polling once connectivity confirmed.

**Deduplication on flush:** Before sending, collapse queue so only the latest write per `(data.client_key, data.section_id)` is kept. This reduces unnecessary writes and effectively extends the 50-op cap.

**Error handling:**
- If `localStorage.setItem()` throws, show banner: "Cannot save offline — please reconnect to the internet before making changes."
- If queue exceeds 50 ops, show banner: "Too many offline changes. Please reconnect to save." Disable further inputs.
- On flush failure, individual ops that fail stay in queue for next flush attempt.

### `showBanner(type, message, actions)`

```
type:    'error' | 'warning' | 'info'
message: String to display
actions: Array of {label, onClick} for buttons (e.g., [{label: 'Retry', onClick: fn}, {label: 'Dismiss', onClick: fn}])
```

Renders a fixed-position banner at viewport top using safe DOM construction (createElement, textContent). Styles:
- error: red background (#c0392b), white text
- warning: yellow background (#f39c12), dark text
- info: blue background (#2980b9), white text

Only one banner per type visible at a time (calling again with same type replaces it). Banner persists until dismissed or replaced.

### `escapeHtml(str)`

Replaces `&`, `<`, `>`, `"`, `'` with their HTML entity equivalents. Returns empty string for falsy input.

### `connectionStatus`

```
connectionStatus.init(containerEl)  — Mount indicator into the given DOM element
connectionStatus.update(state)      — 'online' | 'offline' | 'reconnecting'
```

States:
- `online`: hidden (no indicator when connected, don't add noise)
- `offline`: red dot + "Offline"
- `reconnecting`: yellow dot + "Reconnecting..."
- Transition from offline/reconnecting to online: show green dot + "Connected" for 3s, then hide

Driven by `offlineQueue`'s connectivity monitoring — no duplicate polling.

### `beforeunloadGuard`

```
beforeunloadGuard.trackPending(id)    — Mark a save as in-flight
beforeunloadGuard.trackSuccess(id)    — Mark a save as completed
beforeunloadGuard.trackFailure(id)    — Mark a save as failed
beforeunloadGuard.check()             — Returns true if any pending/failed saves or queued offline ops
```

Attaches/detaches `window.beforeunload` listener automatically based on state.

---

## Phase 1: Data Reliability

### 1.1 Consolidate saves to Supabase SDK

**spotify-selections.html changes:**

1. **`loadSelections()`** (line 1995): Replace `fetch()` to edge function with direct SDK query: `sb.from('wedding_selections').select('*').eq('client_key', clientKey)`. Remove the duplicate anon key references at lines 1997-1998.

2. **`saveCustomMomentDef()`** (line 2191): Replace `fetch()` to Netlify function with `reliableSave()` call using `{client_key, section_id: 'custom-def-' + id, song_title: '__custom_def__', notes: label, updated_at: new Date().toISOString()}`. Remove duplicate anon key references at lines 2198-2199.

**netlify/functions/save-selection.js:** Replace body with 410 stub that returns `{statusCode: 410, body: '{"error": "Deprecated"}'}` with CORS headers. Leave `load-selections.js` and `spotify.js` intact.

### 1.2 Wire reliableSave to all write paths

**spotify-selections.html:**
- `saveSelection()` (line 1900): wrap with `reliableSave()`
- `saveNotes()` (line 1931): wrap with `reliableSave()`
- `clearSelection()` (line 1947): wrap DELETE call with `reliableDelete()`

**admin.html:**
- Client creation (`sb.from('clients').insert(...)`) via `reliableSave()`
- Inline edit name/date/email (`sb.from('clients').update(...)`) via `reliableSave()`
- Toggle lock via `reliableSave()`
- Delete client via `reliableDelete()`
- Save admin reply (`sb.from('wedding_selections').upsert(...)`) via `reliableSave()`

### 1.3 Read-after-write verification

Handled inside `reliableSave()`. No additional page-level changes needed. First save per session does full read-back comparing `spotify_url`, `song_title`, `artist`, `notes`. Subsequent saves trust SDK response.

### 1.4 Offline queue integration

**Both pages, on DOMContentLoaded:**
- Call `offlineQueue.init(sb)`
- If `offlineQueue.hasPending()`, show info banner and flush
- All `reliableSave()` calls automatically check connectivity

### 1.5 Fix duplicate function definitions

**spotify-selections.html:**
- Delete first `initMakeSelectionLinks()` definition (around line 1571)
- Delete `updateProgramDebug()` (around line 1707)
- Keep second `initMakeSelectionLinks()` (line 1690) and `updateProgram()` (line 1588)

### 1.6 Add auto-save to per-section notes

**spotify-selections.html:** Add 1.5s debounced `input` listeners to `#guest-seating-notes`, `#cocktail-notes`, `#dinner-notes`, `#dance-floor-notes`. Each calls `reliableSave()` with section-notes data.

### 1.7 Fix additional-notes save path

**spotify-selections.html:** Replace the auto-save IIFE (line 2222) to use `reliableSave()` instead of bare `saveNotes()`. Gets retry + banner support.

### 1.8 Expired magic link handling

**spotify-selections.html, after Supabase init:** Listen to `sb.auth.onAuthStateChange()`. On `SIGNED_OUT` event, show error banner with "Your access link has expired" and mailto link. Set `window._fortifySavesDisabled = true` to block further save attempts.

Active only after Phase 2.1 Step 3 tightens anon policy. Until then, anon access is the fallback.

---

## Phase 2: Security

### 2.1 Enable RLS on `wedding_selections`

**Supabase Dashboard actions (not code changes):**

Step 1: Enable RLS with permissive anon policy (all operations allowed for anon — no-op safety check).

Step 2: Add auth-scoped policy using `auth.jwt()->'user_metadata'->>'client_key'` matching the row's `client_key`.

Step 3 (after migration): Verify all active clients have authenticated (query auth.users, check last_sign_in_at), then tighten anon policy to read-only.

**Code change — spotify-selections.html:** On first visit with auth session, store client_key in metadata via `sb.auth.updateUser({ data: { client_key: getClientKey() } })` if not already set.

### 2.2 Enable RLS on `clients`

**Supabase Dashboard:** Policy uses `auth.jwt()->'user_metadata'->>'is_admin' = 'true'` for all operations.

**Manual step:** Add `is_admin: true` to admin user metadata via Dashboard (Auth, Users, admin email, Edit User Metadata).

### 2.3 Sanitize admin.html template literals

In `loadClients()` and any other function building HTML from data, wrap all dynamic values with `escapeHtml()` from utils.js. Apply to: `c.name`, `c.email`, `c.wedding_date`, `clientNote`, `adminReply`, any displayed URL.

### 2.4 Rate limiting on magic link sends

**admin.html:** Track `lastSentAt` timestamp. Enforce 60s cooldown with countdown on button text. Catch 429/rate-limit errors and show user-friendly warning.

### 2.5 Key consolidation

Already handled by 1.1 — removing fetch calls eliminates 3 of 4 duplicate key occurrences. Remaining one per file is already a const at script top.

---

## Phase 3: UX Reliability

### 3.1 Error boundary for Supabase SDK load failure

**Both pages:** After Supabase init try/catch, if `sb` is null, use safe DOM construction (createElement + textContent) to show a full-page overlay with "Unable to Connect" heading, explanation text, and a Refresh button that calls `location.reload()`.

### 3.2 Connection status indicator

**Both pages HTML:** Add `<span id="connection-status"></span>` to header area.

**JS:** Call `connectionStatus.init(document.getElementById('connection-status'))` on DOMContentLoaded.

### 3.3 Fix locked overlay email

**spotify-selections.html (line ~701):** Replace Cloudflare-obfuscated email with plain mailto link to `chi@chiduly.com`.

---

## Stretch Goal

### S.1 Unify index.html design system

Copy `:root` CSS custom properties from spotify-selections.html into index.html. Swap Bebas Neue for Bodoni Moda, DM Sans for Raleway, neon yellow (#e8ff00) for gold (#a07840). Update Google Fonts link tag.

---

## Files Changed Summary

| File | Action | Phase |
|------|--------|-------|
| `js/fortify-utils.js` | **NEW** — shared utilities | 1 |
| `spotify-selections.html` | MODIFY — SDK consolidation, reliableSave wiring, auto-save, error boundary, connection status, session handling | 1, 2, 3 |
| `admin.html` | MODIFY — reliableSave wiring, XSS sanitization, rate limiting, error boundary, connection status | 1, 2, 3 |
| `netlify/functions/save-selection.js` | MODIFY — replace with 410 stub | 1 |
| Supabase Dashboard | CONFIG — RLS policies, admin user metadata | 2 |
| `index.html` | MODIFY — design unification (stretch) | S |

## Execution Order

1. Create `js/fortify-utils.js` with all shared utilities
2. Phase 1.5: Dead code removal (low risk, clean slate)
3. Phase 1.1: SDK consolidation + stub save-selection.js
4. Phase 1.2: Wire reliableSave to all write paths (both pages)
5. Phase 1.3: Read-after-write (already in reliableSave)
6. Phase 1.6 + 1.7: Auto-save for all notes
7. Phase 1.4: Offline queue integration
8. Phase 1.8: Session expiry handling
9. Phase 3.1: Error boundaries (both pages)
10. Phase 3.2: Connection status indicator
11. Phase 3.3: Fix locked overlay email
12. Phase 2.5: Key consolidation (already done by 1.1)
13. Phase 2.3: XSS sanitization in admin.html
14. Phase 2.4: Rate limiting on magic link sends
15. Phase 2.1: Enable RLS on wedding_selections (Supabase Dashboard)
16. Phase 2.2: Enable RLS on clients (Supabase Dashboard)
17. Phase S.1: Design unification (stretch, skip if time-constrained)

## Success Criteria

1. Every write succeeds (with SDK validation + first-save read-after-write) or shows a persistent, unmissable error with retry
2. One client cannot access another's data (RLS enforced)
3. No user-controlled string executes as HTML in admin dashboard
4. Saves queue locally when offline and sync on reconnect
5. If Supabase SDK fails to load or magic link expires, user sees a clear message
