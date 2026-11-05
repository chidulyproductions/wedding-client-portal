#!/usr/bin/env node
/**
 * scripts/storage-watch.js
 *
 * Reports how full the `client-audio` bucket is against its 500 MB budget
 * (Chris's call, 2026-11-04) and how much of it no wedding_selections row
 * points at. Run daily by .github/workflows/storage-watch.yml.
 *
 * Exit code: 0 under the warning line, 1 at or over it. A failed scheduled run
 * is what makes GitHub send the notification email.
 *
 * Read-only. Uses the public anon key, the same one in the pages: the bucket's
 * "client-audio anon read" policy allows listing, and RLS is off on
 * wedding_selections. It never uploads, deletes or writes anything.
 *
 *   SUPABASE_ANON_KEY=... node scripts/storage-watch.js
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lfnlftxqdelcrmbceiob.supabase.co';
const BUCKET = 'client-audio';
const MB = 1024 * 1024;
const BUDGET_BYTES = 500 * MB;
const WARN_BYTES = 400 * MB;   // 80% of budget: room to clean up before it fills
const PAGE = 1000;

// ── Pure logic (tested in tests/storage-watch.test.js) ──

// Totals for a list of objects ({ name, size }), split by whether any
// audio_url points at them. `referencedNames` holds object names (not URLs).
function summarize(objects, referencedNames) {
  const refs = referencedNames instanceof Set ? referencedNames : new Set(referencedNames || []);
  let totalBytes = 0, unreferencedBytes = 0;
  const unreferenced = [];
  for (const o of objects || []) {
    const size = Number(o.size) || 0;
    totalBytes += size;
    if (!refs.has(o.name)) { unreferencedBytes += size; unreferenced.push(o); }
  }
  return { count: (objects || []).length, totalBytes, unreferenced, unreferencedBytes };
}

// 'ok' | 'warn' | 'over'. 'warn' and 'over' both fail the run.
function level(totalBytes) {
  if (totalBytes >= BUDGET_BYTES) return 'over';
  if (totalBytes >= WARN_BYTES) return 'warn';
  return 'ok';
}

// Object name inside the bucket for a stored audio_url, or null if the URL is
// not one of ours. Mirrors audioPathFromUrl in spotify-selections.html.
function objectNameFromUrl(url, supabaseUrl = SUPABASE_URL) {
  const prefix = supabaseUrl + '/storage/v1/object/public/' + BUCKET + '/';
  if (typeof url !== 'string' || !url.startsWith(prefix)) return null;
  try { return decodeURIComponent(url.slice(prefix.length).split('?')[0]); } catch (e) { return null; }
}

function formatMB(bytes) {
  return (bytes / MB).toFixed(1) + ' MB';
}

function report(summary) {
  const pct = Math.round(100 * summary.totalBytes / BUDGET_BYTES);
  const lines = [
    `client-audio: ${formatMB(summary.totalBytes)} of ${formatMB(BUDGET_BYTES)} budget (${pct}%), ${summary.count} file(s).`,
    `Not referenced by any wedding_selections row: ${summary.unreferenced.length} file(s), ${formatMB(summary.unreferencedBytes)}.`,
  ];
  if (summary.unreferenced.length) {
    lines.push('Unreferenced files (likely junk, or orphans from a failed save; check before deleting):');
    for (const o of summary.unreferenced.slice(0, 50)) lines.push(`  - ${o.name} (${formatMB(Number(o.size) || 0)})`);
    if (summary.unreferenced.length > 50) lines.push(`  …and ${summary.unreferenced.length - 50} more`);
  }
  const l = level(summary.totalBytes);
  if (l === 'over') lines.push(`OVER BUDGET. Clear unreferenced files first, then decide whether to raise the budget.`);
  else if (l === 'warn') lines.push(`Past the ${formatMB(WARN_BYTES)} warning line.`);
  return lines.join('\n');
}

// ── Network ──

async function api(path, key, init = {}) {
  const res = await fetch(SUPABASE_URL + path, {
    ...init,
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

// Every object in the bucket, descending into folders (entries with id null).
async function listObjects(key, prefix = '') {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await api(`/storage/v1/object/list/${BUCKET}`, key, {
      method: 'POST',
      body: JSON.stringify({ prefix, limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    for (const e of page || []) {
      const name = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.id === null) out.push(...await listObjects(key, name));
      else out.push({ name, size: e.metadata && e.metadata.size });
    }
    if (!page || page.length < PAGE) break;
  }
  return out;
}

async function referencedObjectNames(key) {
  const names = new Set();
  for (let offset = 0; ; offset += PAGE) {
    const rows = await api(
      `/rest/v1/wedding_selections?select=audio_url&audio_url=not.is.null&limit=${PAGE}&offset=${offset}`, key);
    for (const r of rows || []) { const n = objectNameFromUrl(r.audio_url); if (n) names.add(n); }
    if (!rows || rows.length < PAGE) break;
  }
  return names;
}

async function main() {
  const key = process.env.SUPABASE_ANON_KEY;
  if (!key) { console.error('SUPABASE_ANON_KEY is not set.'); process.exit(2); }
  const [objects, refs] = await Promise.all([listObjects(key), referencedObjectNames(key)]);
  const summary = summarize(objects, refs);
  const text = report(summary);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) {
    require('fs').appendFileSync(process.env.GITHUB_STEP_SUMMARY, '```\n' + text + '\n```\n');
  }
  const l = level(summary.totalBytes);
  if (l !== 'ok') {
    console.log(`::error::client-audio is at ${formatMB(summary.totalBytes)} (${l === 'over' ? 'over the' : 'near the'} ${formatMB(BUDGET_BYTES)} budget)`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err.message || err); process.exit(2); });
}

module.exports = { summarize, level, objectNameFromUrl, report, formatMB, BUDGET_BYTES, WARN_BYTES, MB };
