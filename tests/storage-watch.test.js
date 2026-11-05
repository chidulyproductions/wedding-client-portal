// Run from the repo root: node --test tests/*.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { summarize, level, objectNameFromUrl, report, BUDGET_BYTES, WARN_BYTES, MB } = require('../scripts/storage-watch.js');

const BASE = 'https://lfnlftxqdelcrmbceiob.supabase.co';

test('objectNameFromUrl: only our bucket URLs map to an object name', () => {
  assert.equal(objectNameFromUrl(BASE + '/storage/v1/object/public/client-audio/abc.mp3', BASE), 'abc.mp3');
  assert.equal(objectNameFromUrl(BASE + '/storage/v1/object/public/client-audio/abc.mp3?download=First%20Dance.mp3', BASE), 'abc.mp3');
  assert.equal(objectNameFromUrl(BASE + '/storage/v1/object/public/client-audio/a%20b.wav', BASE), 'a b.wav');
  assert.equal(objectNameFromUrl('https://evil.example/storage/v1/object/public/client-audio/abc.mp3', BASE), null);
  assert.equal(objectNameFromUrl(BASE + '/storage/v1/object/public/other-bucket/abc.mp3', BASE), null);
  assert.equal(objectNameFromUrl(null, BASE), null);
});

test('summarize: totals, and what no row points at', () => {
  const s = summarize(
    [{ name: 'a.mp3', size: 10 * MB }, { name: 'b.mp3', size: 5 * MB }, { name: 'junk.mp3', size: 2 * MB }, { name: 'nosize.mp3' }],
    new Set(['a.mp3', 'b.mp3', 'gone.mp3']));
  assert.equal(s.count, 4);
  assert.equal(s.totalBytes, 17 * MB);
  assert.deepEqual(s.unreferenced.map(o => o.name), ['junk.mp3', 'nosize.mp3']);
  assert.equal(s.unreferencedBytes, 2 * MB);
});

test('level: warns at 400 MB, over at the 500 MB budget', () => {
  assert.equal(BUDGET_BYTES, 500 * MB);
  assert.equal(level(0), 'ok');
  assert.equal(level(WARN_BYTES - 1), 'ok');
  assert.equal(level(WARN_BYTES), 'warn');
  assert.equal(level(BUDGET_BYTES - 1), 'warn');
  assert.equal(level(BUDGET_BYTES), 'over');
});

test('report: states usage against the budget and lists unreferenced files', () => {
  const text = report(summarize([{ name: 'a.mp3', size: 250 * MB }, { name: 'junk.mp3', size: 1 * MB }], ['a.mp3']));
  assert.match(text, /251\.0 MB of 500\.0 MB budget \(50%\), 2 file\(s\)/);
  assert.match(text, /Not referenced .*: 1 file\(s\), 1\.0 MB/);
  assert.match(text, /- junk\.mp3 \(1\.0 MB\)/);
  assert.doesNotMatch(text, /OVER BUDGET|warning line/);
  assert.match(report(summarize([{ name: 'a', size: 450 * MB }], ['a'])), /Past the 400\.0 MB warning line/);
  assert.match(report(summarize([{ name: 'a', size: 600 * MB }], ['a'])), /OVER BUDGET/);
});
