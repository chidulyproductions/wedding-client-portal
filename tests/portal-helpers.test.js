// Run from the repo root: node --test tests/*.test.js
// Covers the pure helpers in portal-helpers.js that spotify-selections.html loads.
const test = require('node:test');
const assert = require('node:assert/strict');
const { saveErrorMessage } = require('../portal-helpers.js');

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
