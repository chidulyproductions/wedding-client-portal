// Run from the repo root: node --test tests/*.test.js
// Covers the pure helpers in portal-helpers.js that spotify-selections.html loads.
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveErrorMessage, momentProgress, progressLabel, esc, jsArg, safeHttpUrl } = require('../portal-helpers.js');
const vm = require('node:vm');

test('saveErrorMessage: offline wins over whatever the error says', () => {
  assert.equal(saveErrorMessage({ message: 'duplicate key' }, false), 'Offline — not saved');
});

test('saveErrorMessage: fetch failures read as a connection error in every browser', () => {
  for (const message of [
    'TypeError: Failed to fetch',                                   // Chrome
    'NetworkError when attempting to fetch resource.',              // Firefox
    'Load failed',                                                  // Safari
    'Network request failed',
  ]) {
    assert.equal(saveErrorMessage({ message }, true), 'Connection error — not saved', message);
  }
  assert.equal(saveErrorMessage('connection unavailable', true), 'Connection error — not saved');
});

test('saveErrorMessage: server-side errors never leak raw codes to the client', () => {
  assert.equal(saveErrorMessage({ code: '23505', message: 'duplicate key value violates unique constraint' }, true),
    'Save failed — try again');
  assert.equal(saveErrorMessage({ code: 'PGRST301' }, true), 'Save failed — try again');
  assert.equal(saveErrorMessage(undefined, true), 'Save failed — try again');
});

test('momentProgress: a saved link or an attached edit both count as selected', () => {
  assert.deepEqual(momentProgress([
    { hasLink: true },
    { hasAudio: true },                  // audio-only moment, no link
    { hasLink: true, hasAudio: true },   // edit with its Spotify backup — still one moment
    {},
  ]), { selected: 3, total: 4 });
});

test('momentProgress: removed and retired moments leave the program entirely', () => {
  assert.deepEqual(momentProgress([
    { hasLink: true },
    { removed: true, hasLink: true },    // removed after choosing — not in the program any more
    { removed: true },                   // e.g. the retired ceremony-exit, hidden by default
    {},
  ]), { selected: 1, total: 2 });
});

test('momentProgress: nothing to count', () => {
  assert.deepEqual(momentProgress([]), { selected: 0, total: 0 });
  assert.deepEqual(momentProgress(undefined), { selected: 0, total: 0 });
});

test('progressLabel wording', () => {
  assert.equal(progressLabel({ selected: 0, total: 18 }), '0 of 18 moments selected');
  assert.equal(progressLabel({ selected: 7, total: 18 }), '7 of 18 moments selected');
  assert.equal(progressLabel({ selected: 18, total: 18 }), 'All 18 moments selected');
  assert.equal(progressLabel({ selected: 0, total: 1 }), '0 of 1 moment selected');
  assert.equal(progressLabel({ selected: 1, total: 1 }), 'Your moment is selected');
  assert.equal(progressLabel({ selected: 0, total: 0 }), '');
});

test('esc: markup in a stored note renders as text', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('</textarea><script>x</script>'), '&lt;/textarea&gt;&lt;script&gt;x&lt;/script&gt;');
  assert.equal(esc('a "quoted" & \'single\''), 'a &quot;quoted&quot; &amp; &#39;single&#39;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(42), '42');
});

// Decode the entities the way the HTML parser does for an attribute value.
const decodeAttr = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('jsArg: an inline handler receives the exact original string, quotes and all', () => {
  for (const value of ["O'Brien & Sons", 'say "hi"', "'); alert(1); ('", '</script><b>', 'back\\slash', 'line\nbreak']) {
    const attr = jsArg(value);
    assert.doesNotMatch(attr, /["<>]/, 'nothing that could end the attribute or open a tag');
    let received;
    vm.runInNewContext('fn(' + decodeAttr(attr) + ')', { fn: v => { received = v; } });
    assert.equal(received, value);
  }
});

test('safeHttpUrl: only absolute http(s) links survive', () => {
  assert.equal(safeHttpUrl('https://www.dropbox.com/scl/fo/abc?dl=0'), 'https://www.dropbox.com/scl/fo/abc?dl=0');
  assert.equal(safeHttpUrl('  http://example.com/x  '), 'http://example.com/x');
  for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', '/relative/path', 'not a url', '', null, undefined]) {
    assert.equal(safeHttpUrl(bad), '', String(bad));
  }
});
