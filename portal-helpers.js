// Pure helpers for spotify-selections.html. No DOM, no network — kept in their
// own file so they can be tested with `node --test tests/*.test.js` (this repo has no
// build step, so the page loads this as a plain classic script and the
// functions become globals; the module.exports line at the bottom is only for
// the tests and is a no-op in the browser).

// Short, client-facing reason for a failed save, shown in the saved pill.
// The raw error is logged and put in the pill's title for debugging — clients
// see either "it's your connection" or "try again", never a PostgREST code.
function saveErrorMessage(err, online) {
  if (online === false) return 'Offline — not saved';
  const raw = String((err && (err.message || err.code)) || err || '');
  // supabase-js reports a dropped connection as an error object whose message
  // is the fetch failure; browsers word it differently.
  if (/failed to fetch|networkerror|network request failed|load failed|connection/i.test(raw)) {
    return 'Connection error — not saved';
  }
  return 'Save failed — try again';
}

// Progress through the program. `moments` is one entry per moment the page
// knows about (standard and custom): { removed, hasLink, hasAudio }. A moment
// the couple removed — or a retired one the template hides — is not part of
// their program, so it counts toward neither number. A moment is selected when
// a link has been saved for it or a custom edit is attached (an audio-only
// moment has no link and still counts).
function momentProgress(moments) {
  let selected = 0;
  let total = 0;
  for (const m of moments || []) {
    if (!m || m.removed) continue;
    total++;
    if (m.hasLink || m.hasAudio) selected++;
  }
  return { selected, total };
}

function progressLabel(progress) {
  const { selected, total } = progress || {};
  if (!total) return '';
  if (selected >= total) return total === 1 ? 'Your moment is selected' : 'All ' + total + ' moments selected';
  return selected + ' of ' + total + (total === 1 ? ' moment' : ' moments') + ' selected';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { saveErrorMessage, momentProgress, progressLabel };
}
