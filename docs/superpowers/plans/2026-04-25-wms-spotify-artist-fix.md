# WMS Spotify Artist Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore Spotify artist capture in the WMS client portal and backfill the 30 historical null-artist rows in `wedding_selections`.

**Architecture:** Frontend `fetchSongInfo()` branches by URL host — Spotify URLs route through the existing-but-unwired `netlify/functions/spotify.js` (Spotify Web API client-credentials flow), while YouTube and SoundCloud continue using their oEmbed endpoints unchanged. A one-shot Node script in `scripts/` performs the historical backfill against the same Web API path.

**Tech Stack:** Vanilla JS frontend (no framework), Node 18+ Netlify Functions, Supabase Postgres + REST API, Spotify Web API.

**Reference Spec:** `docs/superpowers/specs/2026-04-25-wms-spotify-artist-fix-design.md`

**Project Conventions Reminder (from `~/.claude/CLAUDE.md`):**
- Create the Jira ticket *before* writing code; transition statuses with separate `jira_add_comment` calls
- NO git commits until the user explicitly asks
- Batch commits, single push when the whole task is done
- Never push to main without explicit approval

---

## File Plan

| File | Action | Responsibility |
|---|---|---|
| `spotify-selections.html` | Modify (`fetchSongInfo()` ~lines 1946-1968) | Branch URL fetch by host; Spotify uses Netlify function, others unchanged |
| `netlify/functions/spotify.js` | Verify only — no code change | Server-side Spotify Web API lookup, returns `{title, artist}` |
| `scripts/backfill-spotify-artist.js` | Create | One-shot historical backfill (30 null-artist rows) |
| `.env.example` | Modify | Add missing `SPOTIFY_CLIENT_ID` line |

No new test infrastructure — repo has none. Verification is manual per the spec's Test Plan.

---

## Phase 1 — Jira and Pre-flight Verification

### Task 1: Create the Jira ticket

**Files:** None (Jira API only)

- [ ] **Step 1: Create the WED ticket**

Use Atlassian MCP `mcp__plugin_atlassian_atlassian__createJiraIssue`:

- Project key: `WED`
- Issue type: `Bug`
- Summary: `Fix WMS Spotify selections not capturing artist field`
- Description (markdown):
  ```
  Spotify selections in the client portal save with `artist = null` due to a March 18 regression (commit 838a87e) that replaced a working Supabase Edge Function with direct oEmbed calls. Spotify's public oEmbed endpoint does not return `author_name`, so artist is always empty.

  Database state on 2026-04-25: 30 of 31 Spotify rows in `wedding_selections` have `artist IS NULL`.

  Design spec: docs/superpowers/specs/2026-04-25-wms-spotify-artist-fix-design.md
  Implementation plan: docs/superpowers/plans/2026-04-25-wms-spotify-artist-fix.md

  Manual verification (regression test):
  1. Load `spotify-selections.html?client=<test_key>` in a browser
  2. Paste a Spotify track URL into any section
  3. Wait for the iframe to render
  4. Query Supabase REST: row should have `artist` non-null and matching the actual track artist
  ```

- [ ] **Step 2: Capture the ticket key**

Note the returned ticket key (e.g., `WED-42`) for use in subsequent steps. Replace `WED-XX` everywhere below with the actual key.

- [ ] **Step 3: Transition to In Progress**

Use `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` to find the In Progress transition ID, then `mcp__plugin_atlassian_atlassian__transitionJiraIssue` to apply it.

- [ ] **Step 4: Add transition comment (separate call — known gotcha)**

Use `mcp__plugin_atlassian_atlassian__addCommentToJiraIssue` with body:
```
Starting work. Plan: deploy frontend fix to route Spotify URL lookups through the existing `netlify/functions/spotify.js` (Web API), then run a one-shot backfill script against the 30 null-artist rows.
```

(Per global rules: `transitionJiraIssue`'s comment param silently fails — always use `addCommentToJiraIssue` separately.)

---

### Task 2: Verify Netlify environment variables

**Files:** None (Netlify dashboard or CLI inspection only)

- [ ] **Step 1: Determine the Netlify site name / production URL**

Inspect `netlify.toml` (already read — it has no site name, just `[functions] directory` and `[build] publish`). Get the production URL from the Netlify dashboard, or ask the user. Record as `<wms-domain>` for use in Task 3.

- [ ] **Step 2: Confirm `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` are set in Netlify env**

Open Netlify dashboard → site → Site settings → Environment variables. Confirm both keys are present with non-empty values.

If `SPOTIFY_CLIENT_ID` is missing: get the value from the Spotify Developer Dashboard (https://developer.spotify.com/dashboard) for the existing app, add it to Netlify env, and note that a redeploy will be needed before the function works.

- [ ] **Step 3: Note deployment status of `spotify.js`**

If the function has been deployed before (next-task curl returns valid JSON), this is a no-op. If not, the next push of any change will deploy it (because `netlify.toml` already configures `directory = "netlify/functions"`).

---

### Task 3: Curl-test the orphan function in production

**Files:** None

- [ ] **Step 1: Curl the function endpoint**

Run:
```bash
curl -sS -X POST 'https://<wms-domain>/.netlify/functions/spotify' \
  -H 'Content-Type: application/json' \
  -d '{"spotifyUrl":"https://open.spotify.com/track/4cDDW81n1BtUfmbulXzrl8"}'
```

Expected output (one line):
```json
{"type":"track","title":"Landslide","artist":"Brooklyn Duo"}
```

- [ ] **Step 2: Interpret the result**

- **200 + valid JSON with `artist` field** → function is live and working. Continue to Phase 2.
- **404** → function not deployed yet. The frontend change in Task 5 will deploy it on next push. Continue.
- **500 with "Could not get Spotify token"** → env vars missing or wrong. Re-check Task 2 Step 2. Stop until fixed.
- **Any other 5xx** → investigate. Stop until resolved.

---

## Phase 2 — Implementation

### Task 4: Add `SPOTIFY_CLIENT_ID` to `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Edit `.env.example`**

Find this section:
```
# Spotify (used by Netlify functions)
SPOTIFY_CLIENT_SECRET=
```

Replace with:
```
# Spotify (used by Netlify functions)
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
```

- [ ] **Step 2: Verify**

Run `grep -E '^SPOTIFY_' .env.example` and confirm both lines present.

(No commit yet — per project convention, batch commits at the end on user's request.)

---

### Task 5: Modify `fetchSongInfo()` in `spotify-selections.html`

**Files:**
- Modify: `spotify-selections.html` (lines 1946-1968 — function body of `fetchSongInfo`)

- [ ] **Step 1: Read the current function body to confirm exact line range**

Open `spotify-selections.html` and find the comment `// ── FETCH SONG INFO (Spotify / YouTube / SoundCloud oEmbed) ──`. The current function spans from the comment to the closing `}` of `fetchSongInfo`.

Current code (for reference — this is what gets replaced):
```js
    // ── FETCH SONG INFO (Spotify / YouTube / SoundCloud oEmbed) ──
    async function fetchSongInfo(url, sectionId) {
      const platform = detectPlatform(url);
      try {
        let oembedUrl;
        if (platform === 'spotify') {
          oembedUrl = 'https://open.spotify.com/oembed?url=' + encodeURIComponent(url);
        } else if (platform === 'youtube') {
          oembedUrl = 'https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
        } else if (platform === 'soundcloud') {
          oembedUrl = 'https://soundcloud.com/oembed?url=' + encodeURIComponent(url) + '&format=json';
        } else {
          return null;
        }
        const response = await fetch(oembedUrl);
        const data = await response.json();
        const artist = data.author_name || '';
        if (data.title) updateProgram(sectionId, data.title, artist, url);
        return { title: data.title || null, artist, html: data.html || null };
      } catch (err) {
        console.log('Could not fetch song info:', err);
        return null;
      }
    }
```

- [ ] **Step 2: Replace the function body with the new version**

New code (replaces the entire block above, including the comment):
```js
    // ── FETCH SONG INFO (Spotify via Web API; YouTube / SoundCloud via oEmbed) ──
    // Spotify's public oEmbed endpoint does not return author_name, so we route
    // Spotify URLs through /.netlify/functions/spotify (client-credentials Web API)
    // to capture the real artist. YouTube and SoundCloud continue using oEmbed
    // since their responses include author_name (channel/uploader name —
    // imperfect but populates).
    async function fetchSongInfo(url, sectionId) {
      const platform = detectPlatform(url);
      if (!platform) return null;

      try {
        let title = null;
        let artist = '';

        if (platform === 'spotify') {
          // Primary: call the Netlify function (Spotify Web API)
          const fnRes = await fetch('/.netlify/functions/spotify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ spotifyUrl: url })
          });
          if (fnRes.ok) {
            const data = await fnRes.json();
            title = data.title || null;
            artist = data.artist || '';
          } else {
            // Fallback: oEmbed (title-only) so the form still progresses if the
            // function path is unhealthy. Artist will be empty in this case.
            console.log('Spotify Web API path failed (' + fnRes.status + '), falling back to oEmbed');
            const obRes = await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(url));
            const ob = await obRes.json();
            title = ob.title || null;
            artist = '';
          }
        } else if (platform === 'youtube') {
          const res = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
          const data = await res.json();
          title = data.title || null;
          artist = data.author_name || '';
        } else if (platform === 'soundcloud') {
          const res = await fetch('https://soundcloud.com/oembed?url=' + encodeURIComponent(url) + '&format=json');
          const data = await res.json();
          title = data.title || null;
          artist = data.author_name || '';
        }

        if (title) updateProgram(sectionId, title, artist, url);
        return { title, artist };
      } catch (err) {
        console.log('Could not fetch song info:', err);
        return null;
      }
    }
```

- [ ] **Step 3: Visual diff sanity check**

Run `git diff spotify-selections.html`. Expected: only the `fetchSongInfo` function changed — no other code modified. The diff should be additions + deletions confined to the function body.

- [ ] **Step 4: Confirm no other call sites need updating**

Run:
```bash
grep -nE 'fetchSongInfo|fetchSpotifyInfo' spotify-selections.html
```

Expected to find:
- The function definition itself
- One call at ~line 2112: `fetchSongInfo(url, sectionId).then(info => {`
- One alias at ~line 2004: `async function fetchSpotifyInfo(url, sectionId) { return fetchSongInfo(url, sectionId); }`

The alias and the call site work without modification because the public signature of `fetchSongInfo` is unchanged. Caller only uses `info.title` (still returned) — never `info.html` (which we dropped).

- [ ] **Step 5: Confirm `info.html` is genuinely unused downstream**

Run:
```bash
grep -nE '\.html\b' spotify-selections.html | grep -v 'data\.html\|innerHTML\|\.html_'
```

There should be no consumer of the dropped `html` field. (Earlier exploration on 2026-04-25 confirmed iframes are built from track IDs separately at line ~2079, not from oEmbed `html`.)

(No commit yet.)

---

### Task 6: Create `scripts/backfill-spotify-artist.js`

**Files:**
- Create: `scripts/backfill-spotify-artist.js`

- [ ] **Step 1: Create the `scripts/` directory if missing**

Run:
```bash
mkdir -p scripts
```

- [ ] **Step 2: Write the script**

Create `scripts/backfill-spotify-artist.js` with this exact content:

```js
#!/usr/bin/env node
/**
 * scripts/backfill-spotify-artist.js
 *
 * One-shot historical backfill for the WMS Spotify-artist regression
 * (see docs/superpowers/specs/2026-04-25-wms-spotify-artist-fix-design.md).
 *
 * Targets rows in `wedding_selections` where:
 *   spotify_url LIKE '%spotify.com/track/%'
 *   AND artist IS NULL
 *
 * For each such row, calls the Spotify Web API client-credentials flow to look
 * up the track's real artist, then PATCHes the row by UUID.
 *
 * Idempotent: re-running after success is a no-op (filter excludes non-null
 * artist rows). Safe to interrupt mid-run; just re-run.
 *
 * Usage:
 *   node scripts/backfill-spotify-artist.js --dry-run   # preview, no writes
 *   node scripts/backfill-spotify-artist.js             # apply
 *
 * Env required (loaded from .env or shell):
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY     (service-role key)
 *   SPOTIFY_CLIENT_ID
 *   SPOTIFY_CLIENT_SECRET
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// ── Minimal .env loader (no dependency) ─────────────────────────────────────
function loadDotenv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    // Strip surrounding quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}
loadDotenv();

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars: ' + missing.join(', '));
  console.error('Add them to .env (see .env.example) or export them in your shell.');
  process.exit(2);
}

const SUPABASE_URL = process.env.SUPABASE_URL.replace(/\/$/, '');
const SB_KEY = process.env.SUPABASE_SECRET_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

// ── Helpers ─────────────────────────────────────────────────────────────────
async function getSpotifyToken() {
  const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + creds
    },
    body: 'grant_type=client_credentials'
  });
  if (!res.ok) throw new Error(`Token fetch failed: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.access_token) throw new Error('Token response missing access_token');
  return data.access_token;
}

function extractTrackId(url) {
  const m = url.match(/spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return m ? m[1] : null;
}

async function lookupArtist(token, trackId) {
  const res = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { 'Authorization': 'Bearer ' + token }
  });
  if (!res.ok) {
    throw new Error(`Track lookup ${trackId} failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.artists) || data.artists.length === 0) {
    throw new Error(`Track ${trackId} returned no artists`);
  }
  return {
    title: data.name,
    artist: data.artists.map(a => a.name).join(', ')
  };
}

async function fetchTargetRows() {
  const url = `${SUPABASE_URL}/rest/v1/wedding_selections` +
    `?spotify_url=ilike.*spotify.com/track/*` +
    `&artist=is.null` +
    `&select=id,client_key,section_id,song_title,spotify_url`;
  const res = await fetch(url, {
    headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY }
  });
  if (!res.ok) {
    throw new Error(`Supabase query failed: HTTP ${res.status} — ${await res.text()}`);
  }
  return res.json();
}

async function patchArtist(rowId, artist) {
  const url = `${SUPABASE_URL}/rest/v1/wedding_selections?id=eq.${rowId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SB_KEY,
      'Authorization': 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    },
    body: JSON.stringify({ artist })
  });
  if (!res.ok) {
    throw new Error(`PATCH ${rowId} failed: HTTP ${res.status} — ${await res.text()}`);
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(DRY_RUN ? '[DRY RUN] No writes will occur.' : '[APPLY] Writes enabled.');

  const rows = await fetchTargetRows();
  console.log(`Found ${rows.length} target row(s) (spotify track URL with NULL artist).`);
  if (rows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  const token = await getSpotifyToken();
  console.log('Spotify token acquired.');

  let updated = 0;
  let skipped = 0;
  const failures = [];

  for (const row of rows) {
    const trackId = extractTrackId(row.spotify_url);
    if (!trackId) {
      console.log(`  [SKIP] ${row.id} — could not extract track ID from ${row.spotify_url}`);
      skipped++;
      continue;
    }

    try {
      const { title, artist } = await lookupArtist(token, trackId);
      const titleNote = (row.song_title && row.song_title !== title)
        ? ` (stored title="${row.song_title}", spotify title="${title}")`
        : '';
      const action = DRY_RUN ? 'WOULD UPDATE' : 'UPDATE';
      console.log(`  [${action}] ${row.client_key} / ${row.section_id} → artist="${artist}"${titleNote}`);

      if (!DRY_RUN) {
        await patchArtist(row.id, artist);
      }
      updated++;
    } catch (err) {
      console.log(`  [FAIL] ${row.id} (${row.client_key} / ${row.section_id}): ${err.message}`);
      failures.push({ id: row.id, client_key: row.client_key, section_id: row.section_id, error: err.message });
    }
  }

  console.log('');
  console.log(`Summary: ${updated} ${DRY_RUN ? 'would-update' : 'updated'}, ${skipped} skipped, ${failures.length} failed.`);

  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  - ${f.id} (${f.client_key} / ${f.section_id}): ${f.error}`);
    }
    process.exit(1);
  }
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Make it executable (optional but conventional)**

Run:
```bash
chmod +x scripts/backfill-spotify-artist.js
```

- [ ] **Step 4: Smoke-test the script's env validation (without hitting any API)**

Run:
```bash
SUPABASE_URL= SUPABASE_SECRET_KEY= SPOTIFY_CLIENT_ID= SPOTIFY_CLIENT_SECRET= \
  node scripts/backfill-spotify-artist.js --dry-run
```

Expected: prints `Missing required env vars: ...`, exits with code 2.

(No commit yet.)

---

## Phase 3 — Verification & Rollout

### Task 7: Push the frontend change to deploy + verify in browser

> **Note:** This is the only push step. Per project convention, the user must explicitly authorize the push. Stop and ask before executing this task.

- [ ] **Step 1: Confirm clean diff before push**

Run:
```bash
git status
git diff --stat
```

Expected modified/created files:
- `spotify-selections.html` (modified)
- `.env.example` (modified)
- `scripts/backfill-spotify-artist.js` (new file)
- `docs/superpowers/specs/2026-04-25-wms-spotify-artist-fix-design.md` (new)
- `docs/superpowers/plans/2026-04-25-wms-spotify-artist-fix.md` (new)

- [ ] **Step 2: Wait for explicit user authorization to commit and push**

Per `~/.claude/CLAUDE.md`: "NO git commits unless I explicitly ask. Batch commits, push once — only `git push` when the full task is done."

Pause here. Ask the user whether to commit + push now, or wait.

- [ ] **Step 3: When authorized, commit and push**

Suggested commit message (HEREDOC):
```bash
git add spotify-selections.html .env.example scripts/backfill-spotify-artist.js \
        docs/superpowers/specs/2026-04-25-wms-spotify-artist-fix-design.md \
        docs/superpowers/plans/2026-04-25-wms-spotify-artist-fix.md
git commit -m "$(cat <<'EOF'
fix(client-portal): restore Spotify artist capture (WED-XX)

The March 18 commit 838a87e replaced a working Supabase Edge Function
with direct calls to Spotify's public oEmbed endpoint. oEmbed for Spotify
returns title only (no author_name), so every Spotify selection has been
silently saving with artist=null since then. 30 of 31 Spotify rows in
wedding_selections were affected.

Restore the pre-838a87e behavior by routing Spotify URLs through the
already-existing-but-unwired netlify/functions/spotify.js, which calls
the Spotify Web API (client-credentials) and returns both title and
artist. YouTube and SoundCloud continue using oEmbed unchanged.

Adds scripts/backfill-spotify-artist.js for one-shot historical
backfill of the 30 null-artist rows.

Adds SPOTIFY_CLIENT_ID to .env.example (was missing).

Manual regression test: paste a Spotify track on a test client portal,
confirm the wedding_selections row has a non-null artist matching the
real track artist.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
git push
```

Replace `WED-XX` with the actual ticket key from Task 1.

- [ ] **Step 4: Wait for Netlify deploy to complete**

Watch the Netlify dashboard or run `gh run watch` if GitHub Actions are wired. Typical deploy time: 30-60 seconds.

- [ ] **Step 5: Post-deploy curl test**

Re-run the curl from Task 3:
```bash
curl -sS -X POST 'https://<wms-domain>/.netlify/functions/spotify' \
  -H 'Content-Type: application/json' \
  -d '{"spotifyUrl":"https://open.spotify.com/track/4cDDW81n1BtUfmbulXzrl8"}'
```

Expected: `{"type":"track","title":"Landslide","artist":"Brooklyn Duo"}`

If still 404 or 500, stop and investigate before backfill.

- [ ] **Step 6: Browser regression test**

Pick or create a test client (or use an existing client_key). In a browser:
1. Open `https://<wms-domain>/spotify-selections.html?client=<test_key>`
2. Find any Spotify-input section (e.g., First Dance)
3. Paste a known Spotify track URL — recommend a track whose artist you can verify visually, e.g., `https://open.spotify.com/track/4cDDW81n1BtUfmbulXzrl8` (Brooklyn Duo's Landslide)
4. Wait 1-2 seconds for the iframe to render

- [ ] **Step 7: Database confirmation**

Run:
```bash
SB_KEY="<anon_key_from_spotify-selections.html>"
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.<test_key>&section_id=eq.<test_section>&select=song_title,artist,spotify_url" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY"
```

Expected: row has `"artist":"Brooklyn Duo"` (or whatever artist the test track has — non-null and correct).

If artist is still null: stop. Re-check Task 2 env vars and Task 5 frontend logic. Do NOT proceed to backfill until forward-fix is verified.

---

### Task 8: Run backfill in dry-run mode

**Files:** None (script execution only)

- [ ] **Step 1: Confirm `.env` has all four required vars**

Run:
```bash
grep -E '^(SUPABASE_URL|SUPABASE_SECRET_KEY|SPOTIFY_CLIENT_ID|SPOTIFY_CLIENT_SECRET)=' .env | wc -l
```

Expected: `4`. If less, populate `.env` from the values currently in Netlify (or ask the user).

- [ ] **Step 2: Run dry-run**

Run:
```bash
node scripts/backfill-spotify-artist.js --dry-run
```

Expected output shape:
```
[DRY RUN] No writes will occur.
Found 30 target row(s) (spotify track URL with NULL artist).
Spotify token acquired.
  [WOULD UPDATE] madison---mitchell-2026-05-09 / recessional-party → artist="Brooklyn Duo"
  [WOULD UPDATE] madison---mitchell-2026-05-09 / bride-walk → artist="The Cinematic Orchestra"
  ... (28 more)

Summary: 30 would-update, 0 skipped, 0 failed.
```

- [ ] **Step 3: Eyeball the proposed updates**

Read the dry-run output. Sanity-check: does each artist value look like a real artist (not "Spotify", not "Various Artists" suspiciously, not blank)? Any failures or skips?

If any rows look wrong: stop, investigate the specific row, decide whether to:
- Fix the row's `spotify_url` first
- Manually patch instead
- Add a skip-list to the script

- [ ] **Step 4: User checkpoint**

Show the dry-run output to the user. Wait for explicit "go ahead" before applying.

---

### Task 9: Apply backfill

**Files:** None (script execution only)

- [ ] **Step 1: Run the apply pass**

Run:
```bash
node scripts/backfill-spotify-artist.js
```

Expected output:
```
[APPLY] Writes enabled.
Found 30 target row(s) (spotify track URL with NULL artist).
Spotify token acquired.
  [UPDATE] madison---mitchell-2026-05-09 / recessional-party → artist="Brooklyn Duo"
  ... (29 more)

Summary: 30 updated, 0 skipped, 0 failed.
```

Exit code: `0`.

If non-zero exit or any failures listed: investigate per-row errors. Re-run is safe — only null-artist rows are touched on the next run.

- [ ] **Step 2: Independent database verification**

Run:
```bash
SB_KEY="<anon_or_service_role>"
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?spotify_url=ilike.*spotify.com/track/*&artist=is.null&select=count" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" \
  -H "Prefer: count=exact" -I 2>&1 | grep -i content-range
```

Expected: `content-range: 0-0/0` (zero null-artist Spotify-track rows remain).

- [ ] **Step 3: Spot-check Madison & Mitch rows specifically**

Run:
```bash
curl -s "https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/wedding_selections?client_key=eq.madison---mitchell-2026-05-09&select=section_id,song_title,artist,spotify_url" \
  -H "apikey: $SB_KEY" -H "Authorization: Bearer $SB_KEY" | python3 -m json.tool
```

Expected: every Spotify-track row has a non-null `artist` field. Eyeball the values (e.g., Landslide → Brooklyn Duo, etc.).

---

### Task 10: Close the Jira ticket

**Files:** None (Jira API)

- [ ] **Step 1: Add a verbose closing comment via `addCommentToJiraIssue`**

Body (markdown):
```
Done. Ship summary:

**Root cause:** Commit 838a87e (2026-03-18) replaced the working Supabase `/functions/v1/spotify` Edge Function with direct calls to Spotify's public oEmbed endpoint. Spotify oEmbed returns track title only (no `author_name`), so every selection saved since then had `artist = null`. 30 of 31 Spotify rows in `wedding_selections` were affected.

**Fix:**
- `spotify-selections.html` — `fetchSongInfo()` now routes Spotify URLs through `/.netlify/functions/spotify` (Spotify Web API client-credentials flow), which returns title + artist. YouTube and SoundCloud unchanged.
- `netlify/functions/spotify.js` was already in the repo (created 2026-03-08) but never wired up; this PR is what wired it.
- `scripts/backfill-spotify-artist.js` — new one-shot Node script that backfills historical null-artist rows. Idempotent. Run with `--dry-run` to preview.
- `.env.example` — added missing `SPOTIFY_CLIENT_ID` line.

**Backfill result:** 30 rows updated. Post-backfill verification confirmed 0 null-artist Spotify-track rows remain.

**Manual regression test (re-runnable):**
1. Load `spotify-selections.html?client=<test_key>` in a browser.
2. Paste a Spotify track URL into any section.
3. Wait for the iframe to render.
4. Query Supabase REST → row's `artist` field should be non-null and match the actual track artist.

**Out-of-scope items deliberately deferred** (documented in the design spec):
- YouTube/SoundCloud `author_name` is still the channel/uploader name, often not the actual artist. For the WMS use case the source tag (YOUTUBE/SOUNDCLOUD) already signals "verify manually."
- No Playwright test suite added — repo has no test infrastructure today; that's its own piece of work.
- No metadata-drift validation pass for non-null rows (Anniversary-Dance-style oEmbed bugs).
```

- [ ] **Step 2: Find the Done transition ID**

Use `mcp__plugin_atlassian_atlassian__getTransitionsForJiraIssue` with the ticket key.

- [ ] **Step 3: Apply the Done transition**

Use `mcp__plugin_atlassian_atlassian__transitionJiraIssue`. Comment param will silently fail — that's why Step 1 came first.

---

## Self-Review

Spec coverage check:

| Spec section | Plan task |
|---|---|
| Frontend `fetchSongInfo` change | Task 5 |
| `netlify/functions/spotify.js` (verify only, no change) | Tasks 2-3 (verification), no modification task |
| `scripts/backfill-spotify-artist.js` creation | Task 6 |
| `.env.example` `SPOTIFY_CLIENT_ID` addition | Task 4 |
| Pre-flight env + curl verification | Tasks 2, 3 |
| Manual regression test | Task 7 (Steps 6-7) |
| Backfill dry-run + apply | Tasks 8, 9 |
| Final database verification | Task 9 (Steps 2-3) |
| Jira ticket lifecycle | Tasks 1, 10 |
| Out-of-scope items (YAGNI) | Documented in commit message + closing Jira comment |

No spec requirements without tasks. No tasks without spec backing.

Placeholder scan: no `TBD`, `TODO`, "implement later", or vague error-handling references. Every code step has runnable code.

Type / signature consistency:
- `fetchSongInfo(url, sectionId)` — same signature in original and new code; return shape `{title, artist}` (drops `html`, which is unused per the grep verification step)
- Backfill script: env var names match `.env.example` (post-Task-4), Supabase column names match the actual schema (`id`, `client_key`, `section_id`, `song_title`, `artist`, `spotify_url`) verified live on 2026-04-25.

---

## Open Items (resolved at execution time, not blockers)

- `<wms-domain>` — production Netlify URL, fill in during Task 2 Step 1 by inspecting Netlify dashboard.
- `<test_key>` — real client_key to use for the browser test in Task 7. Use an existing key (e.g., `madison---mitchell-2026-05-09`) on a non-data-destructive section, or create a throwaway test client.
- `WED-XX` — actual Jira ticket key from Task 1 Step 2.
