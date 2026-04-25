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
 * For each row, calls the Spotify Web API client-credentials flow to look up
 * the track's real artist, then PATCHes the row by UUID. The script does NOT
 * call the Supabase Edge Function — it talks to Spotify directly so the
 * backfill is independent of edge-function deploy state.
 *
 * Idempotent: re-running after success is a no-op (filter excludes non-null
 * artist rows). Safe to interrupt mid-run; just re-run.
 *
 * Usage:
 *   node scripts/backfill-spotify-artist.js --dry-run   # preview, no writes
 *   node scripts/backfill-spotify-artist.js             # apply
 *
 * Env required (loaded from .env in this directory's parent or shell):
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
  if (!res.ok) throw new Error(`Token fetch failed: HTTP ${res.status} — ${await res.text()}`);
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
