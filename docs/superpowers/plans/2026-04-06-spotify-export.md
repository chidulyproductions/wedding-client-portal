# Spotify Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Spotify export button to the admin dashboard that creates one Spotify playlist per wedding moment for a client, updating in place on re-export.

**Architecture:** Three new Supabase Edge Functions handle the OAuth flow (`spotify-auth`, `spotify-callback`) and the export logic (`spotify-export`). Tokens are stored in a new `spotify_tokens` table. The admin dashboard gets a "Connect Spotify" button in the header and an "Export" button per client row.

**Tech Stack:** Supabase Edge Functions (Deno/TypeScript), Spotify Web API, Supabase JS client, vanilla JS in `admin.html`

---

## File Structure

**New files:**
- `supabase/migrations/20260406_spotify_tokens.sql` — creates `spotify_tokens` table
- `supabase/functions/spotify-auth/index.ts` — OAuth redirect to Spotify
- `supabase/functions/spotify-auth/deno.json` — copied from notify-dj
- `supabase/functions/spotify-callback/index.ts` — OAuth callback, stores tokens
- `supabase/functions/spotify-callback/deno.json` — copied from notify-dj
- `supabase/functions/spotify-export/index.ts` — export logic
- `supabase/functions/spotify-export/deno.json` — copied from notify-dj

**Modified files:**
- `admin.html` — add Connect Spotify button + Export button per client row

---

## Task 1: Create `spotify_tokens` migration

**Files:**
- Create: `supabase/migrations/20260406_spotify_tokens.sql`

- [ ] Create the migration file:

```sql
create table if not exists public.spotify_tokens (
  id           uuid primary key default gen_random_uuid(),
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  updated_at    timestamptz not null default now()
);
```

- [ ] Apply the migration:

```bash
cd "Wedding Music Site"
/opt/homebrew/bin/supabase db push
```

Expected output: `Finished supabase db push.`

- [ ] Verify in Supabase dashboard → Table Editor that `spotify_tokens` exists with the 5 columns.

- [ ] Commit:

```bash
git add supabase/migrations/20260406_spotify_tokens.sql
git commit -m "feat(db): add spotify_tokens table for OAuth token storage"
```

---

## Task 2: Set Spotify secrets in Supabase

**Files:** none (secrets only)

- [ ] Get the Client Secret from the Spotify dashboard (Chi Loader app → "View client secret")

- [ ] Set all three secrets:

```bash
/opt/homebrew/bin/supabase secrets set SPOTIFY_CLIENT_ID=ecb4eb3edb86498cad342641540efe5d
/opt/homebrew/bin/supabase secrets set SPOTIFY_CLIENT_SECRET=<paste secret here>
/opt/homebrew/bin/supabase secrets set SPOTIFY_REDIRECT_URI=https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-callback
```

- [ ] Add the redirect URI in the Spotify Developer Dashboard:
  - Go to Chi Loader app → Edit Settings
  - Add `https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-callback` to Redirect URIs
  - Save

No commit needed — secrets are not stored in git.

---

## Task 3: Create `spotify-auth` Edge Function

**Files:**
- Create: `supabase/functions/spotify-auth/index.ts`
- Create: `supabase/functions/spotify-auth/deno.json`

- [ ] Copy `deno.json` from `notify-dj`:

```bash
cp supabase/functions/notify-dj/deno.json supabase/functions/spotify-auth/deno.json
```

- [ ] Create `supabase/functions/spotify-auth/index.ts`:

```typescript
import "@supabase/functions-js/edge-runtime.d.ts"

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_REDIRECT_URI = Deno.env.get("SPOTIFY_REDIRECT_URI")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "playlist-read-private",
].join(" ");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
    return new Response(JSON.stringify({ error: "Spotify env vars not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: SPOTIFY_CLIENT_ID,
    scope: SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  return Response.redirect(authUrl, 302);
});
```

- [ ] Deploy:

```bash
/opt/homebrew/bin/supabase functions deploy spotify-auth --no-verify-jwt
```

Expected: `Deployed Functions on project lfnlftxqdelcrmbceiob: spotify-auth`

- [ ] Test by visiting this URL in your browser — it should redirect to Spotify's authorization page:
`https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-auth`

- [ ] Commit:

```bash
git add supabase/functions/spotify-auth/
git commit -m "feat(edge-fn): add spotify-auth edge function for OAuth redirect"
```

---

## Task 4: Create `spotify-callback` Edge Function

**Files:**
- Create: `supabase/functions/spotify-callback/index.ts`
- Create: `supabase/functions/spotify-callback/deno.json`

- [ ] Copy `deno.json`:

```bash
cp supabase/functions/notify-dj/deno.json supabase/functions/spotify-callback/deno.json
```

- [ ] Create `supabase/functions/spotify-callback/index.ts`:

```typescript
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SPOTIFY_REDIRECT_URI = Deno.env.get("SPOTIFY_REDIRECT_URI")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Admin dashboard URL — redirect here after auth
const ADMIN_URL = "https://chidulyproductions.github.io/wedding-client-portal/admin.html";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return Response.redirect(`${ADMIN_URL}?spotify_error=${error ?? "no_code"}`, 302);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    console.error("Token exchange failed:", err);
    return Response.redirect(`${ADMIN_URL}?spotify_error=token_exchange_failed`, 302);
  }

  const tokens = await tokenRes.json();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // Store tokens — single row, always upserted
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { error: dbError } = await supabase.from("spotify_tokens").upsert({
    id: "00000000-0000-0000-0000-000000000001", // fixed ID — single row
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  });

  if (dbError) {
    console.error("Failed to store tokens:", dbError.message);
    return Response.redirect(`${ADMIN_URL}?spotify_error=db_write_failed`, 302);
  }

  return Response.redirect(`${ADMIN_URL}?spotify_connected=true`, 302);
});
```

- [ ] Deploy:

```bash
/opt/homebrew/bin/supabase functions deploy spotify-callback --no-verify-jwt
```

Expected: `Deployed Functions on project lfnlftxqdelcrmbceiob: spotify-callback`

- [ ] Test the full OAuth flow end to end:
  - Visit `https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-auth` in browser
  - Authorize on Spotify
  - Should redirect back to admin dashboard with `?spotify_connected=true` in the URL
  - Check Supabase → Table Editor → `spotify_tokens` — should have 1 row

- [ ] Commit:

```bash
git add supabase/functions/spotify-callback/
git commit -m "feat(edge-fn): add spotify-callback edge function for OAuth token storage"
```

---

## Task 5: Create `spotify-export` Edge Function

**Files:**
- Create: `supabase/functions/spotify-export/index.ts`
- Create: `supabase/functions/spotify-export/deno.json`

- [ ] Copy `deno.json`:

```bash
cp supabase/functions/notify-dj/deno.json supabase/functions/spotify-export/deno.json
```

- [ ] Create `supabase/functions/spotify-export/index.ts`:

```typescript
import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Section IDs that are playlists or text — skip these in export
const EXCLUDED_SECTIONS = new Set([
  "guest-seating", "cocktail-hour", "dinner-hour", "dance-floor",
  "announcement", "additional-notes", "admin-reply",
]);

// Section ID → human label
const SECTION_LABELS: Record<string, string> = {
  "wedding-party-walk": "Wedding Party Walk",
  "bride-walk":         "Bride Walk",
  "the-kiss":           "The Kiss",
  "ceremony-exit":      "Ceremony Exit",
  "party-entrance":     "Wedding Party Entrance",
  "grand-entrance":     "Grand Entrance",
  "first-dance":        "First Dance",
  "father-daughter":    "Father/Daughter Dance",
  "mother-son":         "Mother/Son Dance",
  "anniversary-dance":  "Anniversary Dance",
  "last-song":          "Last Song of the Night",
  "cake-cutting":       "Cake Cutting",
  "bouquet-toss":       "Bouquet Toss",
  "last-dance":         "Last Dance (Private)",
};

function getSectionLabel(sectionId: string): string {
  if (sectionId.startsWith("custom-def-")) return "Custom Moment";
  return SECTION_LABELS[sectionId] ?? sectionId;
}

function isSpotifyTrackUrl(url: string): boolean {
  return url.startsWith("https://open.spotify.com/track/");
}

function extractSpotifyTrackId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

// Refresh access token using refresh token
async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: string }> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

// Spotify API helper
async function spotifyFetch(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${err}`);
  }
  // 204 No Content returns no body
  if (res.status === 204) return null;
  return res.json();
}

// Get DJ's Spotify user ID
async function getSpotifyUserId(accessToken: string): Promise<string> {
  const data = await spotifyFetch("/me", accessToken);
  return data.id;
}

// Find existing playlist by name in DJ's library
async function findPlaylistByName(name: string, userId: string, accessToken: string): Promise<string | null> {
  let offset = 0;
  while (true) {
    const data = await spotifyFetch(`/me/playlists?limit=50&offset=${offset}`, accessToken);
    const match = data.items.find((p: { name: string; id: string }) => p.name === name);
    if (match) return match.id;
    if (data.items.length < 50) return null;
    offset += 50;
  }
}

// Create a new playlist
async function createPlaylist(name: string, description: string, userId: string, accessToken: string): Promise<string> {
  const data = await spotifyFetch(`/users/${userId}/playlists`, accessToken, {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
  return data.id;
}

// Update playlist description
async function updatePlaylistDescription(playlistId: string, description: string, accessToken: string) {
  await spotifyFetch(`/playlists/${playlistId}`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ description }),
  });
}

// Replace all tracks in a playlist (clear + add)
async function replacePlaylistTracks(playlistId: string, trackUris: string[], accessToken: string) {
  await spotifyFetch(`/playlists/${playlistId}/tracks`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ uris: trackUris }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { client_key, client_name } = await req.json();

    if (!client_key || !client_name) {
      return new Response(JSON.stringify({ error: "Missing client_key or client_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Load tokens
    const { data: tokenRow, error: tokenErr } = await supabase
      .from("spotify_tokens")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: "Spotify not connected. Connect Spotify first." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Refresh token if expired or within 5 minutes of expiry
    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      await supabase.from("spotify_tokens").update({
        access_token: refreshed.access_token,
        expires_at: refreshed.expires_at,
        updated_at: new Date().toISOString(),
      }).eq("id", "00000000-0000-0000-0000-000000000001");
    }

    // Load all selections for this client
    const { data: selections, error: selErr } = await supabase
      .from("wedding_selections")
      .select("section_id, spotify_url, song_title, artist")
      .eq("client_key", client_key);

    if (selErr) throw new Error(`Failed to load selections: ${selErr.message}`);

    // Filter to exportable sections:
    // - Not in EXCLUDED_SECTIONS
    // - Not a -notes row
    // - Not a tombstone (null spotify_url with no custom def)
    // - Not a custom-def row (__custom_def__ marker)
    const exportable = (selections ?? []).filter((row) => {
      if (EXCLUDED_SECTIONS.has(row.section_id)) return false;
      if (row.section_id.endsWith("-notes")) return false;
      if (row.song_title === "__custom_def__") return false;
      if (!row.spotify_url && !row.song_title) return false; // tombstone
      return true;
    });

    // Validation: find true blanks (null spotify_url, not a tombstone)
    const blanks = exportable.filter((row) => !row.spotify_url);
    if (blanks.length > 0) {
      const missingLabels = blanks.map((r) => getSectionLabel(r.section_id));
      return new Response(JSON.stringify({
        error: "Export blocked: missing songs",
        missing: missingLabels,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get DJ's Spotify user ID
    const userId = await getSpotifyUserId(accessToken);

    // Export each section
    const manualSections: string[] = [];

    for (const row of exportable) {
      const momentLabel = getSectionLabel(row.section_id);
      const playlistName = `${client_name} — ${momentLabel}`;
      const isSpotify = isSpotifyTrackUrl(row.spotify_url);

      // Find or create playlist
      let playlistId = await findPlaylistByName(playlistName, userId, accessToken);

      if (isSpotify) {
        const trackId = extractSpotifyTrackId(row.spotify_url);
        if (!trackId) {
          // Malformed Spotify URL — treat as manual
          manualSections.push(momentLabel);
          const desc = row.spotify_url;
          if (playlistId) {
            await replacePlaylistTracks(playlistId, [], accessToken);
            await updatePlaylistDescription(playlistId, desc, accessToken);
          } else {
            playlistId = await createPlaylist(playlistName, desc, userId, accessToken);
          }
          continue;
        }

        const trackUri = `spotify:track:${trackId}`;
        if (playlistId) {
          await replacePlaylistTracks(playlistId, [trackUri], accessToken);
          await updatePlaylistDescription(playlistId, "", accessToken);
        } else {
          playlistId = await createPlaylist(playlistName, "", userId, accessToken);
          await replacePlaylistTracks(playlistId, [trackUri], accessToken);
        }
      } else {
        // Non-Spotify URL: empty playlist, URL in description
        manualSections.push(momentLabel);
        const desc = row.spotify_url;
        if (playlistId) {
          await replacePlaylistTracks(playlistId, [], accessToken);
          await updatePlaylistDescription(playlistId, desc, accessToken);
        } else {
          playlistId = await createPlaylist(playlistName, desc, userId, accessToken);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      exported: exportable.length,
      manual: manualSections,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

- [ ] Deploy:

```bash
/opt/homebrew/bin/supabase functions deploy spotify-export --no-verify-jwt
```

Expected: `Deployed Functions on project lfnlftxqdelcrmbceiob: spotify-export`

- [ ] Commit:

```bash
git add supabase/functions/spotify-export/
git commit -m "feat(edge-fn): add spotify-export edge function for wedding program Spotify export"
```

---

## Task 6: Admin Dashboard — Connect Spotify Button

**Files:**
- Modify: `admin.html`

Add a "Connect Spotify" button to the admin dashboard header. It checks on load whether Spotify is already connected (by checking if `spotify_tokens` has a row via the service role — but we can't call that from the frontend with anon key). Instead, the admin will read the URL params on load: `?spotify_connected=true` sets a localStorage flag.

- [ ] Find the admin dashboard header section in `admin.html`. It has a `<div class="top-bar">` with "Chi Duly Productions — Admin" and a "Sign Out" button. Add the Spotify button HTML after the sign-out button:

```html
<button id="spotify-btn" class="action-btn" onclick="connectSpotify()" style="background:none;border:1px solid var(--border);color:var(--muted);border-radius:5px;padding:7px 16px;font-family:var(--font-body);font-size:0.72rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;cursor:pointer;transition:all 0.2s;">
  Connect Spotify
</button>
```

- [ ] Add the `connectSpotify()` function and connection state logic in the `<script>` section of `admin.html`, near the top of the script (after existing constants):

```javascript
// ── SPOTIFY CONNECTION ──
function connectSpotify() {
  window.location.href = 'https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-auth';
}

function updateSpotifyBtn() {
  const btn = document.getElementById('spotify-btn');
  if (!btn) return;
  const connected = localStorage.getItem('spotify_connected') === 'true';
  if (connected) {
    btn.textContent = 'Spotify Connected ✓';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
    btn.style.cursor = 'default';
    btn.onclick = null;
  }
}

// Check URL params on load for OAuth callback result
(function checkSpotifyCallback() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('spotify_connected') === 'true') {
    localStorage.setItem('spotify_connected', 'true');
    // Clean up URL
    const url = new URL(window.location);
    url.searchParams.delete('spotify_connected');
    window.history.replaceState({}, '', url);
  }
  if (params.get('spotify_error')) {
    console.error('Spotify OAuth error:', params.get('spotify_error'));
    const url = new URL(window.location);
    url.searchParams.delete('spotify_error');
    window.history.replaceState({}, '', url);
  }
})();
```

- [ ] Call `updateSpotifyBtn()` after the dashboard renders. Find where `renderClients()` or dashboard init code runs and add `updateSpotifyBtn()` call there. Also call it on DOMContentLoaded.

- [ ] Push to GitHub Pages to deploy:

```bash
git add admin.html
git commit -m "feat(admin): add Connect Spotify button to dashboard header"
git push origin main
```

Wait ~1 min, then verify the button appears in the admin dashboard header.

---

## Task 7: Admin Dashboard — Export Button Per Client Row

**Files:**
- Modify: `admin.html`

- [ ] Find where client rows are rendered in `admin.html` — look for the function that builds each `<tr>` for a client (likely `renderClients()` or similar). Add an Export button cell to each row:

```javascript
// Add this button in the actions cell for each client row
const exportBtn = document.createElement('button');
exportBtn.className = 'action-btn';
exportBtn.textContent = 'Export ♫';
exportBtn.style.cssText = 'background:none;border:1px solid var(--border);color:var(--muted);border-radius:4px;padding:5px 12px;font-family:var(--font-body);font-size:0.7rem;letter-spacing:0.1em;cursor:pointer;transition:all 0.2s;margin-left:6px;';
exportBtn.onclick = () => exportToSpotify(c, exportBtn);
```

- [ ] Add the `exportToSpotify()` function in the script section:

```javascript
async function exportToSpotify(client, btn) {
  const connected = localStorage.getItem('spotify_connected') === 'true';
  if (!connected) {
    alert('Connect Spotify first using the button in the header.');
    return;
  }

  const clientKey = (client.name + '-' + client.wedding_date)
    .toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const originalText = btn.textContent;
  btn.textContent = 'Exporting...';
  btn.disabled = true;

  try {
    const res = await fetch('https://lfnlftxqdelcrmbceiob.supabase.co/functions/v1/spotify-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_key: clientKey, client_name: client.name }),
    });

    const data = await res.json();

    if (!res.ok) {
      if (data.missing && data.missing.length > 0) {
        alert(`Export blocked — missing songs for:\n\n${data.missing.join('\n')}\n\nFill in or remove these sections first.`);
      } else {
        alert(`Export failed: ${data.error}`);
      }
      return;
    }

    let msg = `Exported ${data.exported} playlist${data.exported !== 1 ? 's' : ''} to Spotify.`;
    if (data.manual && data.manual.length > 0) {
      msg += `\n\nHandle manually (non-Spotify links — check playlist descriptions):\n${data.manual.join('\n')}`;
    }
    alert(msg);

    btn.textContent = 'Exported ✓';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'var(--green)';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.color = '';
      btn.style.borderColor = '';
      btn.disabled = false;
    }, 3000);

  } catch (err) {
    alert(`Export error: ${err.message}`);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}
```

- [ ] Push to deploy:

```bash
git add admin.html
git commit -m "feat(admin): add Export to Spotify button per client row"
git push origin main
```

---

## Task 8: End-to-End Test

- [ ] Open admin dashboard: `https://chidulyproductions.github.io/wedding-client-portal/admin.html`

- [ ] Click **Connect Spotify** → authorize on Spotify → should return to admin with "Spotify Connected ✓" in header

- [ ] Click **Export ♫** on Sierra & Thad

- [ ] Expected: success alert saying how many playlists were exported, plus any manual sections

- [ ] Open Spotify → check your playlists — should see new playlists named `Sierra & Thad — First Dance`, `Sierra & Thad — Bride Walk`, etc.

- [ ] For any non-Spotify sections: open the playlist → check the description contains the URL

- [ ] Re-export the same client (click Export again) — should update playlists in place, not create duplicates

- [ ] Test blank check: temporarily remove a song from a section in the client portal, then try to export → should be blocked with a message listing the missing moment

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | — |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 0 | — | — |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

**VERDICT:** NO REVIEWS YET
