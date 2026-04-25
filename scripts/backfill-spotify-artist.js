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
 * For each row, calls the deployed Supabase Edge Function `spotify` (which
 * does the Spotify Web API client-credentials flow server-side) to look up
 * the track's real artist, then PATCHes the row by UUID.
 *
 * Auth model: uses the Supabase ANON key (already public — hardcoded in
 * spotify-selections.html). RLS is disabled on `wedding_selections` per the
 * project CLAUDE.md, so anon has full read/write access. No service-role
 * key needed locally; no Spotify creds needed locally.
 *
 * Idempotent: re-running after success is a no-op (filter excludes non-null
 * artist rows). Safe to interrupt mid-run; just re-run.
 *
 * Usage:
 *   node scripts/backfill-spotify-artist.js --dry-run   # preview, no writes
 *   node scripts/backfill-spotify-artist.js             # apply
 */

'use strict';

const DRY_RUN = process.argv.includes('--dry-run');

// Public values — already exposed in the client-portal HTML, safe to hardcode here.
const SUPABASE_URL = 'https://lfnlftxqdelcrmbceiob.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxmbmxmdHhxZGVsY3JtYmNlaW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5Mzg5NDIsImV4cCI6MjA4ODUxNDk0Mn0._-XQuBtlKW0B87QDR6kF1wYU_0FQLjRnTPMJ7xIp59s';

const sbHeaders = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
};

async function fetchTargetRows() {
  const url = `${SUPABASE_URL}/rest/v1/wedding_selections` +
    `?spotify_url=ilike.*spotify.com/track/*` +
    `&artist=is.null` +
    `&select=id,client_key,section_id,song_title,spotify_url`;
  const res = await fetch(url, { headers: sbHeaders });
  if (!res.ok) {
    throw new Error(`Supabase query failed: HTTP ${res.status} — ${await res.text()}`);
  }
  return res.json();
}

async function lookupViaEdgeFn(spotifyUrl) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/spotify`, {
    method: 'POST',
    headers: { ...sbHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ spotifyUrl }),
  });
  if (!res.ok) {
    throw new Error(`Edge fn HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  if (!data.artist) throw new Error('Edge fn returned no artist field');
  return { title: data.title, artist: data.artist };
}

async function patchArtist(rowId, artist) {
  const url = `${SUPABASE_URL}/rest/v1/wedding_selections?id=eq.${rowId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...sbHeaders, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ artist }),
  });
  if (!res.ok) {
    throw new Error(`PATCH ${rowId} failed: HTTP ${res.status} — ${await res.text()}`);
  }
}

(async () => {
  console.log(DRY_RUN ? '[DRY RUN] No writes will occur.' : '[APPLY] Writes enabled.');

  const rows = await fetchTargetRows();
  console.log(`Found ${rows.length} target row(s) (spotify track URL with NULL artist).`);
  if (rows.length === 0) {
    console.log('Nothing to do.');
    return;
  }

  let updated = 0;
  const failures = [];

  for (const row of rows) {
    try {
      const { title, artist } = await lookupViaEdgeFn(row.spotify_url);
      const titleNote = (row.song_title && row.song_title !== title)
        ? ` (stored title="${row.song_title}", spotify title="${title}")`
        : '';
      const action = DRY_RUN ? 'WOULD UPDATE' : 'UPDATE';
      console.log(`  [${action}] ${row.client_key} / ${row.section_id} → artist="${artist}"${titleNote}`);

      if (!DRY_RUN) await patchArtist(row.id, artist);
      updated++;
    } catch (err) {
      console.log(`  [FAIL] ${row.id} (${row.client_key} / ${row.section_id}): ${err.message}`);
      failures.push({ id: row.id, client_key: row.client_key, section_id: row.section_id, error: err.message });
    }
  }

  console.log('');
  console.log(`Summary: ${updated} ${DRY_RUN ? 'would-update' : 'updated'}, ${failures.length} failed.`);

  if (failures.length > 0) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f.id} (${f.client_key} / ${f.section_id}): ${f.error}`);
    process.exit(1);
  }
})().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
