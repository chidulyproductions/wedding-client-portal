# Full Fortification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fortify the Wedding Music Site to production-grade reliability — zero silent save failures, data isolation via RLS, XSS-safe admin, offline resilience, graceful degradation.

**Architecture:** New shared `js/fortify-utils.js` provides retry, offline queue, banners, and XSS sanitization to both `spotify-selections.html` and `admin.html`. Both pages load it via script tag before their inline JS. All Supabase writes go through `reliableSave()` / `reliableDelete()`.

**Tech Stack:** Vanilla JS (no build step), Supabase JS SDK (CDN), GitHub Pages hosting, Supabase Postgres + RLS + Edge Functions.

**Spec:** `docs/superpowers/specs/2026-03-26-full-fortification-design.md`

---

## File Structure

| File | Responsibility | Status |
|------|---------------|--------|
| `js/fortify-utils.js` | Shared: reliableSave, reliableDelete, offlineQueue, showBanner, escapeHtml, connectionStatus, beforeunloadGuard | NEW |
| `spotify-selections.html` | Client music selection page — SDK consolidation, auto-save, error boundary, connection indicator | MODIFY |
| `admin.html` | Admin dashboard — reliableSave wiring, XSS sanitization, rate limiting, error boundary | MODIFY |
| `netlify/functions/save-selection.js` | Deprecated stub (410) | MODIFY |
| `index.html` | Design unification (stretch) | MODIFY |

---

### Task 1: Create `js/fortify-utils.js` — Core Utilities (escapeHtml, showBanner, beforeunloadGuard)

**Files:**
- Create: `js/fortify-utils.js`

- [ ] **Step 1: Create the js directory and file with escapeHtml**

```js
// js/fortify-utils.js — Shared fortification utilities for Wedding Music Site
// Loaded by both spotify-selections.html and admin.html via <script> tag

// ── ESCAPE HTML ──
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
```

- [ ] **Step 2: Add showBanner**

Append to `js/fortify-utils.js`. This function uses safe DOM construction (createElement + textContent) exclusively — no raw HTML string assignment. It creates a fixed-position banner at viewport top with action buttons.

```js
// ── BANNER SYSTEM ──
var _banners = {};

function showBanner(type, message, actions) {
  if (_banners[type]) {
    _banners[type].remove();
    delete _banners[type];
  }

  var colors = {
    error:   { bg: '#c0392b', text: '#fff' },
    warning: { bg: '#f39c12', text: '#1a1218' },
    info:    { bg: '#2980b9', text: '#fff' }
  };
  var style = colors[type] || colors.info;

  var banner = document.createElement('div');
  banner.setAttribute('role', 'alert');
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:10000;padding:14px 20px;' +
    'font-family:"Raleway",sans-serif;font-size:0.9rem;display:flex;align-items:center;' +
    'justify-content:space-between;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,0.2);' +
    'background:' + style.bg + ';color:' + style.text + ';';

  var msg = document.createElement('span');
  msg.textContent = message;
  banner.appendChild(msg);

  if (actions && actions.length) {
    var btnGroup = document.createElement('span');
    btnGroup.style.cssText = 'display:flex;gap:8px;flex-shrink:0;';
    actions.forEach(function(action) {
      var btn = document.createElement('button');
      btn.textContent = action.label;
      btn.style.cssText = 'background:rgba(255,255,255,0.2);color:inherit;border:1px solid rgba(255,255,255,0.4);' +
        'padding:6px 14px;border-radius:4px;cursor:pointer;font-size:0.8rem;font-family:inherit;';
      btn.addEventListener('click', function() {
        if (action.onClick) action.onClick();
        if (action.label === 'Dismiss') {
          banner.remove();
          delete _banners[type];
        }
      });
      btnGroup.appendChild(btn);
    });
    banner.appendChild(btnGroup);
  }

  document.body.appendChild(banner);
  _banners[type] = banner;
}

showBanner.dismiss = function(type) {
  if (_banners[type]) {
    _banners[type].remove();
    delete _banners[type];
  }
};
```

- [ ] **Step 3: Add beforeunloadGuard**

Append to `js/fortify-utils.js`:

```js
// ── BEFOREUNLOAD GUARD ──
var beforeunloadGuard = (function() {
  var _pending = {};
  var _failed = {};
  var _listening = false;

  function _onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes.';
    return e.returnValue;
  }

  function _updateListener() {
    var shouldListen = Object.keys(_pending).length > 0 ||
                       Object.keys(_failed).length > 0 ||
                       (typeof offlineQueue !== 'undefined' && offlineQueue.hasPending());
    if (shouldListen && !_listening) {
      window.addEventListener('beforeunload', _onBeforeUnload);
      _listening = true;
    } else if (!shouldListen && _listening) {
      window.removeEventListener('beforeunload', _onBeforeUnload);
      _listening = false;
    }
  }

  return {
    trackPending: function(id) { _pending[id] = true; _updateListener(); },
    trackSuccess: function(id) { delete _pending[id]; delete _failed[id]; _updateListener(); },
    trackFailure: function(id) { delete _pending[id]; _failed[id] = true; _updateListener(); },
    check: function() {
      return Object.keys(_pending).length > 0 ||
             Object.keys(_failed).length > 0 ||
             (typeof offlineQueue !== 'undefined' && offlineQueue.hasPending());
    }
  };
})();
```

- [ ] **Step 4: Verify the file loads without errors**

Open `js/fortify-utils.js` in a browser console test — paste the contents and confirm no syntax errors. Or simply verify by reading the file and checking for balanced braces.

- [ ] **Step 5: Commit**

```bash
git add js/fortify-utils.js
git commit -m "feat: create js/fortify-utils.js with escapeHtml, showBanner, beforeunloadGuard"
```

---

### Task 2: Add reliableSave and reliableDelete to `js/fortify-utils.js`

**Files:**
- Modify: `js/fortify-utils.js`

- [ ] **Step 1: Add reliableSave**

Append to `js/fortify-utils.js`:

```js
// ── RELIABLE SAVE ──
var _firstSaveVerified = false;
var _savesDisabled = false;

async function reliableSave(sb, table, data, conflictKeys, options) {
  options = options || {};
  var feedbackEl = options.feedbackEl || null;
  var sectionEl = options.sectionEl || null;
  var mode = options.mode || 'upsert';

  if (_savesDisabled) {
    showBanner('error', 'Saves are disabled \u2014 your access link may have expired.', [
      { label: 'Dismiss', onClick: function() {} }
    ]);
    return { success: false, data: null, error: { message: 'Saves disabled' } };
  }

  // If offline, queue the save
  if (typeof offlineQueue !== 'undefined' && !offlineQueue._isOnline()) {
    var queued = offlineQueue.enqueue({ table: table, data: data, conflictKeys: conflictKeys, mode: mode });
    if (queued && feedbackEl) {
      feedbackEl.textContent = 'Queued offline';
      feedbackEl.classList.add('visible');
    }
    return { success: true, data: null, error: null, queued: true };
  }

  var saveId = table + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  beforeunloadGuard.trackPending(saveId);

  if (feedbackEl) {
    feedbackEl.textContent = 'Saving...';
    feedbackEl.classList.add('visible');
  }

  var lastError = null;
  var maxRetries = 3;
  var delays = [1000, 2000, 4000];

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      if (feedbackEl) {
        feedbackEl.textContent = 'Retrying (' + (attempt + 1) + '/' + (maxRetries + 1) + ')...';
        feedbackEl.style.color = '#f39c12';
      }
      await new Promise(function(r) { setTimeout(r, delays[attempt - 1]); });
    }

    try {
      var result;
      if (mode === 'update' && options.selectMatch) {
        result = await sb.from(table).update(data).match(options.selectMatch);
      } else {
        var upsertOpts = conflictKeys ? { onConflict: conflictKeys } : {};
        result = await sb.from(table).upsert(data, upsertOpts);
      }

      if (result.error) {
        lastError = result.error;
        continue;
      }

      // Read-after-write verification (first save per session only)
      if (!_firstSaveVerified && options.verifyFields && options.selectMatch) {
        var check = await sb.from(table).select('*').match(options.selectMatch).single();
        if (check.error || !check.data) {
          lastError = { message: 'Read-after-write verification failed' };
          continue;
        }
        var mismatch = false;
        for (var i = 0; i < options.verifyFields.length; i++) {
          var field = options.verifyFields[i];
          if (String(data[field] || '') !== String(check.data[field] || '')) {
            mismatch = true;
            break;
          }
        }
        if (mismatch) {
          lastError = { message: 'Data mismatch after write' };
          continue;
        }
        _firstSaveVerified = true;
      }

      // Success
      beforeunloadGuard.trackSuccess(saveId);

      if (feedbackEl) {
        feedbackEl.textContent = '\u2713 Saved';
        feedbackEl.style.color = '';
        feedbackEl.classList.add('visible');
        setTimeout(function() { feedbackEl.classList.remove('visible'); }, 3000);
      }

      if (sectionEl) {
        sectionEl.style.borderTopColor = '#27ae60';
        setTimeout(function() { sectionEl.style.borderTopColor = ''; }, 1500);
      }

      showBanner.dismiss('error');
      return { success: true, data: result.data, error: null };

    } catch (err) {
      lastError = err;
      _firstSaveVerified = false; // Reset on network error
    }
  }

  // All retries exhausted
  beforeunloadGuard.trackFailure(saveId);

  if (feedbackEl) {
    feedbackEl.textContent = '\u26A0 Save failed';
    feedbackEl.style.color = '#c0392b';
    feedbackEl.classList.add('visible');
  }

  if (sectionEl) {
    sectionEl.style.borderTopColor = '#c0392b';
  }

  showBanner('error',
    '\u26A0 Your changes were NOT saved. Check your connection and try again.',
    [
      { label: 'Retry', onClick: function() {
        reliableSave(sb, table, data, conflictKeys, options);
      }},
      { label: 'Dismiss', onClick: function() {} }
    ]
  );

  return { success: false, data: null, error: lastError };
}
```

- [ ] **Step 2: Add reliableDelete**

Append to `js/fortify-utils.js`:

```js
// ── RELIABLE DELETE ──
async function reliableDelete(sb, table, match, options) {
  options = options || {};
  var feedbackEl = options.feedbackEl || null;

  var saveId = 'del-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
  beforeunloadGuard.trackPending(saveId);

  var lastError = null;
  var maxRetries = 3;
  var delays = [1000, 2000, 4000];

  for (var attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise(function(r) { setTimeout(r, delays[attempt - 1]); });
    }

    try {
      var result = await sb.from(table).delete().match(match);
      if (result.error) {
        lastError = result.error;
        continue;
      }

      beforeunloadGuard.trackSuccess(saveId);
      return { success: true, data: result.data, error: null };

    } catch (err) {
      lastError = err;
    }
  }

  beforeunloadGuard.trackFailure(saveId);

  showBanner('error',
    '\u26A0 Delete failed. Check your connection and try again.',
    [{ label: 'Dismiss', onClick: function() {} }]
  );

  return { success: false, data: null, error: lastError };
}
```

- [ ] **Step 3: Commit**

```bash
git add js/fortify-utils.js
git commit -m "feat: add reliableSave and reliableDelete with retry, read-after-write, feedback"
```

---

### Task 3: Add offlineQueue and connectionStatus to `js/fortify-utils.js`

**Files:**
- Modify: `js/fortify-utils.js`

- [ ] **Step 1: Add offlineQueue**

Append to `js/fortify-utils.js`:

```js
// ── OFFLINE QUEUE ──
var offlineQueue = (function() {
  var STORAGE_KEY = 'fortify_queue';
  var MAX_QUEUE = 50;
  var HEARTBEAT_INTERVAL = 30000;
  var _sb = null;
  var _online = navigator.onLine;
  var _heartbeatTimer = null;
  var _lastRequestFailed = false;

  function _load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      return (parsed && parsed.queue) ? parsed.queue : [];
    } catch (e) { return []; }
  }

  function _save(queue) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue: queue, version: 1 }));
    } catch (e) {
      showBanner('warning',
        'Cannot save offline \u2014 please reconnect to the internet before making changes.',
        [{ label: 'Dismiss', onClick: function() {} }]
      );
    }
  }

  function _deduplicate(queue) {
    var seen = {};
    var result = [];
    for (var i = queue.length - 1; i >= 0; i--) {
      var op = queue[i];
      var key = (op.data.client_key || '') + '::' + (op.data.section_id || op.data.id || i);
      if (!seen[key]) {
        seen[key] = true;
        result.unshift(op);
      }
    }
    return result;
  }

  function _startHeartbeat() {
    if (_heartbeatTimer) return;
    _heartbeatTimer = setInterval(async function() {
      if (!_online || !_lastRequestFailed) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
        return;
      }
      try {
        var res = await fetch('https://lfnlftxqdelcrmbceiob.supabase.co/rest/v1/', { method: 'HEAD' });
        if (res.ok) {
          _lastRequestFailed = false;
          _online = true;
          connectionStatus.update('online');
          offlineQueue.flush();
        }
      } catch (e) { /* still offline */ }
    }, HEARTBEAT_INTERVAL);
  }

  return {
    init: function(sb) {
      _sb = sb;
      window.addEventListener('online', function() {
        _online = true;
        connectionStatus.update('reconnecting');
        offlineQueue.flush().then(function() {
          connectionStatus.update('online');
        });
      });
      window.addEventListener('offline', function() {
        _online = false;
        connectionStatus.update('offline');
        showBanner('warning',
          "You're offline \u2014 changes are saved locally and will sync when you reconnect.",
          [{ label: 'Dismiss', onClick: function() {} }]
        );
      });
    },

    _isOnline: function() { return _online; },

    enqueue: function(op) {
      var queue = _load();
      if (queue.length >= MAX_QUEUE) {
        showBanner('error',
          'Too many offline changes. Please reconnect to save.',
          [{ label: 'Dismiss', onClick: function() {} }]
        );
        return false;
      }
      op.ts = Date.now();
      queue.push(op);
      _save(queue);
      beforeunloadGuard.trackPending('queue-' + op.ts);
      return true;
    },

    flush: async function() {
      if (!_sb) return;
      var queue = _deduplicate(_load());
      if (!queue.length) return;

      showBanner('info', 'Syncing ' + queue.length + ' offline changes...', []);

      var remaining = [];
      for (var i = 0; i < queue.length; i++) {
        var op = queue[i];
        try {
          var result;
          if (op.mode === 'update' && op.selectMatch) {
            result = await _sb.from(op.table).update(op.data).match(op.selectMatch);
          } else {
            var upsertOpts = op.conflictKeys ? { onConflict: op.conflictKeys } : {};
            result = await _sb.from(op.table).upsert(op.data, upsertOpts);
          }
          if (result.error) {
            remaining.push(op);
          } else {
            beforeunloadGuard.trackSuccess('queue-' + op.ts);
          }
        } catch (e) {
          remaining.push(op);
          _lastRequestFailed = true;
        }
      }

      _save(remaining);

      if (remaining.length === 0) {
        showBanner.dismiss('info');
        showBanner.dismiss('warning');
      } else {
        showBanner('warning',
          remaining.length + ' changes could not sync. Will retry when connection improves.',
          [{ label: 'Dismiss', onClick: function() {} }]
        );
        _startHeartbeat();
      }
    },

    hasPending: function() { return _load().length > 0; },
    count: function() { return _load().length; }
  };
})();
```

- [ ] **Step 2: Add connectionStatus**

Append to `js/fortify-utils.js`:

```js
// ── CONNECTION STATUS INDICATOR ──
var connectionStatus = (function() {
  var _el = null;
  var _hideTimer = null;

  function _render(dotColor, text) {
    if (!_el) return;
    _el.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:0.7rem;' +
      'letter-spacing:0.05em;font-family:"Raleway",sans-serif;margin-left:12px;';
    // Clear existing content safely
    while (_el.firstChild) _el.removeChild(_el.firstChild);
    var dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:' + dotColor + ';display:inline-block;';
    _el.appendChild(dot);
    var label = document.createElement('span');
    label.textContent = text;
    _el.appendChild(label);
  }

  return {
    init: function(containerEl) { _el = containerEl; },
    update: function(state) {
      if (!_el) return;
      if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null; }

      if (state === 'offline') {
        _render('#e74c3c', 'Offline');
      } else if (state === 'reconnecting') {
        _render('#f39c12', 'Reconnecting...');
      } else {
        _render('#27ae60', 'Connected');
        _hideTimer = setTimeout(function() {
          if (_el) _el.style.display = 'none';
        }, 3000);
      }
    }
  };
})();
```

- [ ] **Step 3: Commit**

```bash
git add js/fortify-utils.js
git commit -m "feat: add offlineQueue with dedup/flush and connectionStatus indicator"
```

---

### Task 4: Dead Code Removal in `spotify-selections.html` (Phase 1.5)

**Files:**
- Modify: `spotify-selections.html:1571-1585` (first initMakeSelectionLinks)
- Modify: `spotify-selections.html:1706-1716` (updateProgramDebug)

- [ ] **Step 1: Delete the first `initMakeSelectionLinks()` definition**

In `spotify-selections.html`, delete the block from `// ── INIT MAKE SELECTION LINKS ──` at line 1570 through the closing brace at line 1585. The second definition at line 1689 is the canonical one.

- [ ] **Step 2: Delete `updateProgramDebug()`**

Delete the block from `// ── UPDATE PROGRAM ──  (debug version)` through its closing brace (around original lines 1706-1716, shifted after Step 1).

- [ ] **Step 3: Verify the page still loads**

Open `spotify-selections.html` in a browser with a test URL (e.g., `?name=Test&date=2026-01-01`). Confirm the brochure still renders and "Make Selection" links appear.

- [ ] **Step 4: Commit**

```bash
git add spotify-selections.html
git commit -m "fix: remove duplicate initMakeSelectionLinks and dead updateProgramDebug"
```

---

### Task 5: Add script tag and error boundary to both pages (Phase 3.1)

**Files:**
- Modify: `spotify-selections.html` (before inline script, and Supabase init block)
- Modify: `admin.html` (before inline script, and Supabase init block)

- [ ] **Step 1: Add fortify-utils.js script tag to spotify-selections.html**

In `spotify-selections.html`, immediately before the existing `<script>` tag (around line 1503), add:

```html
  <script src="js/fortify-utils.js"></script>
```

- [ ] **Step 2: Add error boundary to spotify-selections.html**

Replace the Supabase init block:

```js
    let sb = null;
    try {
      sb = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch(e) { console.log('Supabase init error:', e); }
```

With an expanded version that uses safe DOM construction (createElement + textContent) to show a full-page overlay when `sb` is null. The overlay has warm cream background (#faf6f1), "Unable to Connect" heading in gold (#a07840), explanation text, and a Refresh button that calls `location.reload()`. All built with `document.createElement` and `textContent` — no string HTML.

- [ ] **Step 3: Add fortify-utils.js script tag to admin.html**

In `admin.html`, immediately before the existing `<script>` tag (around line 696), add:

```html
  <script src="js/fortify-utils.js"></script>
```

- [ ] **Step 4: Add error boundary to admin.html**

Replace the Supabase init block:

```js
    const { createClient } = supabase;
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
```

With a try/catch version that creates a full-page error overlay using safe DOM methods when `sb` is null. Use admin's dark theme (#0f0d12 background, #f0ecf5 text) for the overlay styling.

- [ ] **Step 5: Commit**

```bash
git add spotify-selections.html admin.html
git commit -m "feat: add fortify-utils.js script tag and SDK error boundary to both pages"
```

---

### Task 6: SDK Consolidation + Stub save-selection.js (Phase 1.1)

**Files:**
- Modify: `spotify-selections.html:1991-2001` (loadSelections)
- Modify: `spotify-selections.html:2191-2212` (saveCustomMomentDef)
- Modify: `netlify/functions/save-selection.js`

- [ ] **Step 1: Replace loadSelections() fetch with SDK query**

In `spotify-selections.html`, in `loadSelections()`, replace the fetch call and its headers with a direct SDK query:

```js
        if (!sb) { console.log('Load skipped: Supabase not initialized'); return; }
        const { data, error: loadErr } = await sb.from('wedding_selections').select('*').eq('client_key', clientKey);
        if (loadErr) { console.log('Load error:', loadErr); return; }
```

This removes the duplicate anon key references that were in the fetch headers.

- [ ] **Step 2: Replace saveCustomMomentDef() fetch with reliableSave**

Replace the entire `saveCustomMomentDef` function with:

```js
    async function saveCustomMomentDef(id, label) {
      await reliableSave(sb, 'wedding_selections', {
        client_key: getClientKey(),
        section_id: 'custom-def-' + id,
        song_title: '__custom_def__',
        notes: label,
        updated_at: new Date().toISOString()
      }, 'client_key,section_id');
    }
```

- [ ] **Step 3: Stub save-selection.js**

Replace the entire contents of `netlify/functions/save-selection.js` with:

```js
exports.handler = async function() {
  return {
    statusCode: 410,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ error: 'Deprecated \u2014 use Supabase SDK directly' })
  };
};
```

- [ ] **Step 4: Commit**

```bash
git add spotify-selections.html netlify/functions/save-selection.js
git commit -m "feat: consolidate all saves to Supabase SDK, stub deprecated save-selection function"
```

---

### Task 7: Wire reliableSave to client page writes (Phase 1.2)

**Files:**
- Modify: `spotify-selections.html` (saveSelection, saveNotes, clearSelection)

- [ ] **Step 1: Replace saveSelection() with reliableSave wrapper**

Replace the entire `saveSelection` function with:

```js
    async function saveSelection(sectionId, spotifyUrl, songTitle, artist) {
      var savedPill = document.getElementById(sectionId + '-saved');
      var sectionCard = document.getElementById('section-' + sectionId);
      if (!sb) {
        if (savedPill) { savedPill.textContent = '\u26A0 Connection error'; savedPill.classList.add('visible'); }
        return false;
      }
      var result = await reliableSave(sb, 'wedding_selections', {
        client_key: getClientKey(),
        section_id: sectionId,
        spotify_url: spotifyUrl || null,
        song_title: songTitle || null,
        artist: artist || null,
        updated_at: new Date().toISOString()
      }, 'client_key,section_id', {
        feedbackEl: savedPill,
        sectionEl: sectionCard,
        verifyFields: ['spotify_url', 'song_title', 'artist'],
        selectMatch: { client_key: getClientKey(), section_id: sectionId }
      });
      return result.success;
    }
```

- [ ] **Step 2: Replace saveNotes() with reliableSave wrapper**

Replace the entire `saveNotes` function with:

```js
    async function saveNotes(sectionId, notes) {
      if (!sb) return;
      await reliableSave(sb, 'wedding_selections', {
        client_key: getClientKey(),
        section_id: sectionId + '-notes',
        notes: notes,
        updated_at: new Date().toISOString()
      }, 'client_key,section_id', {
        verifyFields: ['notes'],
        selectMatch: { client_key: getClientKey(), section_id: sectionId + '-notes' }
      });
    }
```

- [ ] **Step 3: Wire reliableDelete into clearSelection()**

In the `clearSelection` function, find the Supabase delete call and replace it with:

```js
      await reliableDelete(sb, 'wedding_selections', { client_key: getClientKey(), section_id: sectionId });
```

- [ ] **Step 4: Commit**

```bash
git add spotify-selections.html
git commit -m "feat: wire reliableSave/reliableDelete to all client page writes"
```

---

### Task 8: Wire reliableSave to admin page writes (Phase 1.2)

**Files:**
- Modify: `admin.html` (addClient, saveEditName, saveEditDate, saveEditEmail, toggleLock, sendReply, confirmDelete)

- [ ] **Step 1: Update addClient() — replace raw insert with reliableSave**

In `addClient()`, replace the `sb.from('clients').insert(...)` call and its error handling with a `reliableSave()` call. Use `conflictKeys: null` (insert, not upsert) and `feedbackEl: msgEl`.

- [ ] **Step 2: Update sendReply() — replace raw upsert with reliableSave**

In `sendReply()`, replace the `sb.from('wedding_selections').upsert(...)` call with `reliableSave()` using `conflictKeys: 'client_key,section_id'`.

- [ ] **Step 3: Update toggleLock() — replace raw update with reliableSave**

Replace the direct `sb.from('clients').update(...)` call with `reliableSave()` using `mode: 'update'` and `selectMatch: { id: id }`.

- [ ] **Step 4: Update saveEditName() — replace migrations and update with reliableSave**

Replace both the selection migration (`sb.from('wedding_selections').update(...)`) and the client name update (`sb.from('clients').update(...)`) with `reliableSave()` calls using `mode: 'update'`.

- [ ] **Step 5: Update saveEditDate() — same pattern as saveEditName**

Apply the same `reliableSave()` pattern for the selection migration and client date update.

- [ ] **Step 6: Update saveEditEmail() — replace raw update with reliableSave**

Replace `sb.from('clients').update(...)` with `reliableSave()` using `mode: 'update'` and `selectMatch: { id: id }`.

- [ ] **Step 7: Update confirmDelete() — replace raw deletes with reliableDelete**

Replace both `sb.from('wedding_selections').delete()...` and `sb.from('clients').delete()...` calls with `reliableDelete()`.

- [ ] **Step 8: Commit**

```bash
git add admin.html
git commit -m "feat: wire reliableSave/reliableDelete to all admin page writes"
```

---

### Task 9: Auto-save for all notes (Phase 1.6 + 1.7)

**Files:**
- Modify: `spotify-selections.html` (DOMContentLoaded + additional-notes IIFE)

- [ ] **Step 1: Add per-section note auto-save**

In the `DOMContentLoaded` listener, add after `loadSelections()`:

```js
      // Auto-save per-section notes with debounce
      ['guest-seating', 'cocktail', 'dinner', 'dance-floor'].forEach(function(section) {
        var el = document.getElementById(section + '-notes');
        if (!el) return;
        var timer = null;
        el.addEventListener('input', function() {
          clearTimeout(timer);
          timer = setTimeout(function() {
            reliableSave(sb, 'wedding_selections', {
              client_key: getClientKey(),
              section_id: section + '-notes',
              notes: el.value,
              updated_at: new Date().toISOString()
            }, 'client_key,section_id', {
              feedbackEl: document.getElementById(section + '-saved')
            });
          }, 1500);
        });
      });
```

- [ ] **Step 2: Upgrade additional-notes auto-save to use reliableSave**

Replace the existing additional-notes IIFE with one that uses `reliableSave()` instead of bare `saveNotes()`:

```js
    (function() {
      var notesEl = document.getElementById('additional-notes');
      if (!notesEl) return;
      var timer = null;
      notesEl.addEventListener('input', function() {
        clearTimeout(timer);
        timer = setTimeout(function() {
          reliableSave(sb, 'wedding_selections', {
            client_key: getClientKey(),
            section_id: 'additional-notes',
            notes: notesEl.value,
            updated_at: new Date().toISOString()
          }, 'client_key,section_id', {
            feedbackEl: document.getElementById('additional-saved'),
            verifyFields: ['notes'],
            selectMatch: { client_key: getClientKey(), section_id: 'additional-notes' }
          });
        }, 1500);
      });
    })();
```

- [ ] **Step 3: Commit**

```bash
git add spotify-selections.html
git commit -m "feat: add auto-save for per-section notes, upgrade additional-notes to reliableSave"
```

---

### Task 10: Offline queue integration + connection status HTML (Phase 1.4 + 3.2)

**Files:**
- Modify: `spotify-selections.html` (header HTML + DOMContentLoaded)
- Modify: `admin.html` (topbar HTML + init code)

- [ ] **Step 1: Add connection-status span to spotify-selections.html header**

After `<span class="badge">Music Selections</span>`, add:

```html
    <span id="connection-status"></span>
```

- [ ] **Step 2: Initialize offlineQueue and connectionStatus in spotify-selections.html**

In the `DOMContentLoaded` listener, add at the beginning:

```js
      connectionStatus.init(document.getElementById('connection-status'));
      if (sb) {
        offlineQueue.init(sb);
        if (offlineQueue.hasPending()) {
          showBanner('info', 'Syncing previously saved changes...', []);
          offlineQueue.flush().then(function() { showBanner.dismiss('info'); });
        }
      }
```

- [ ] **Step 3: Add connection-status span to admin.html topbar**

After `<div class="topbar-brand">Chi Duly Productions \u2014 Admin</div>`, add:

```html
      <span id="connection-status"></span>
```

- [ ] **Step 4: Initialize offlineQueue and connectionStatus in admin.html**

After the auth state change listener, add:

```js
    connectionStatus.init(document.getElementById('connection-status'));
    if (sb) {
      offlineQueue.init(sb);
      if (offlineQueue.hasPending()) {
        showBanner('info', 'Syncing previously saved changes...', []);
        offlineQueue.flush().then(function() { showBanner.dismiss('info'); });
      }
    }
```

- [ ] **Step 5: Commit**

```bash
git add spotify-selections.html admin.html
git commit -m "feat: integrate offline queue and connection status indicator in both pages"
```

---

### Task 11: Session expiry handling (Phase 1.8)

**Files:**
- Modify: `spotify-selections.html` (after Supabase init)

- [ ] **Step 1: Add auth state change listener**

After the error boundary block, add:

```js
    if (sb) {
      sb.auth.onAuthStateChange(function(event) {
        if (event === 'SIGNED_OUT') {
          _savesDisabled = true;
          showBanner('error',
            'Your access link has expired. Please contact Chi Duly Productions for a new link.',
            [{ label: 'Contact', onClick: function() { window.location.href = 'mailto:chi@chiduly.com'; } }]
          );
        }
      });
    }
```

- [ ] **Step 2: Commit**

```bash
git add spotify-selections.html
git commit -m "feat: add session expiry detection with user-facing banner"
```

---

### Task 12: XSS sanitization in admin.html (Phase 2.3)

**Files:**
- Modify: `admin.html:798-877` (loadClients template literals)

- [ ] **Step 1: Wrap all dynamic values in loadClients() with escapeHtml()**

In the `loadClients()` function's template literal, wrap every instance of dynamic data with `escapeHtml()`:

- `c.name` becomes `escapeHtml(c.name)` (in display div, edit input value, delete confirm)
- `c.email` becomes `escapeHtml(c.email)` (in display div, edit input value)
- `dateFormatted` becomes `escapeHtml(dateFormatted)`
- `c.wedding_date` becomes `escapeHtml(c.wedding_date)` (in edit date input)
- `clientNote` display: use `clientNote ? escapeHtml(clientNote) : '<em style="color:#7a7385;">No notes yet</em>'`
- `adminReply` in textarea: `escapeHtml(adminReply)`
- `url` in href and onclick: `escapeHtml(url)`
- All onclick handler string parameters: wrap with `escapeHtml()`

- [ ] **Step 2: Commit**

```bash
git add admin.html
git commit -m "fix: sanitize all dynamic values in admin template literals to prevent XSS"
```

---

### Task 13: Rate limiting on magic link sends (Phase 2.4)

**Files:**
- Modify: `admin.html` (sendLinkFromModal area)

- [ ] **Step 1: Add cooldown tracking**

Before `sendLinkFromModal()`, add:

```js
    var _lastLinkSentAt = 0;
    var _LINK_COOLDOWN_MS = 60000;
    var _cooldownInterval = null;

    function startCooldownCountdown(btn) {
      _lastLinkSentAt = Date.now();
      clearInterval(_cooldownInterval);
      _cooldownInterval = setInterval(function() {
        var remaining = Math.ceil((_LINK_COOLDOWN_MS - (Date.now() - _lastLinkSentAt)) / 1000);
        if (remaining <= 0) {
          clearInterval(_cooldownInterval);
          btn.textContent = 'Send Link';
          btn.disabled = false;
          return;
        }
        btn.textContent = 'Send Link (wait ' + remaining + 's)';
        btn.disabled = true;
      }, 1000);
    }
```

- [ ] **Step 2: Add cooldown check and 429 handling to sendLinkFromModal**

At the top of `sendLinkFromModal()`, add a cooldown check that returns early with a message if within the 60s window.

In the error handling within the send loop, detect 429 status or "rate" in the error message and show a user-friendly warning instead of the raw error.

After successful send, call `startCooldownCountdown(btn)`.

- [ ] **Step 3: Commit**

```bash
git add admin.html
git commit -m "feat: add 60s cooldown and 429 handling for magic link sends"
```

---

### Task 14: Fix locked overlay email (Phase 3.3)

**Files:**
- Modify: `spotify-selections.html:701`

- [ ] **Step 1: Replace obfuscated email**

Find the Cloudflare-obfuscated email link and replace it with a plain mailto link:

```html
    <div style="margin-top:32px; font-size:0.75rem; letter-spacing:0.2em; text-transform:uppercase; color:#b06878;"><a href="mailto:chi@chiduly.com" style="color:#b06878; text-decoration:none;">chi@chiduly.com</a></div>
```

- [ ] **Step 2: Commit**

```bash
git add spotify-selections.html
git commit -m "fix: replace Cloudflare-obfuscated email with plain mailto link in locked overlay"
```

---

### Task 15: RLS client_key metadata storage (Phase 2.1 code change)

**Files:**
- Modify: `spotify-selections.html` (DOMContentLoaded)

- [ ] **Step 1: Add client_key metadata storage**

In the `DOMContentLoaded` listener, add after `loadSelections()`:

```js
      // Store client_key in auth metadata for RLS (Phase 2.1)
      if (sb) {
        (async function() {
          try {
            var sessionResult = await sb.auth.getSession();
            var session = sessionResult.data && sessionResult.data.session;
            if (session && !(session.user && session.user.user_metadata && session.user.user_metadata.client_key)) {
              await sb.auth.updateUser({ data: { client_key: getClientKey() } });
            }
          } catch (e) { /* Not authenticated */ }
        })();
      }
```

- [ ] **Step 2: Commit**

```bash
git add spotify-selections.html
git commit -m "feat: store client_key in Supabase auth metadata for RLS readiness"
```

---

### Task 16: RLS Dashboard Configuration (Phase 2.1 + 2.2)

**Manual Supabase Dashboard work.**

- [ ] **Step 1: Enable RLS on wedding_selections with permissive anon policy**

Dashboard > Table Editor > wedding_selections > RLS > Enable. Create "anon_full_access" policy: FOR ALL, TO anon, USING (true), WITH CHECK (true).

- [ ] **Step 2: Add auth-scoped policy on wedding_selections**

Create "auth_own_data" policy: FOR ALL, TO authenticated. USING: `client_key = (auth.jwt()->'user_metadata'->>'client_key')`. Same for WITH CHECK.

- [ ] **Step 3: Add is_admin to admin user metadata**

Auth > Users > admin email > Edit metadata: `{"is_admin": true}`

- [ ] **Step 4: Enable RLS on clients with admin-only policy**

Dashboard > Table Editor > clients > RLS > Enable. Create "admin_only" policy: FOR ALL, TO authenticated. USING: `auth.jwt()->'user_metadata'->>'is_admin' = 'true'`. Same for WITH CHECK.

- [ ] **Step 5: Test both pages still work**

---

### Task 17: Design Unification (Stretch Goal S.1)

**Files:**
- Modify: `index.html` (CSS and Google Fonts link)

- [ ] **Step 1: Update Google Fonts link**

Replace the Bebas Neue + DM Sans font link with Bodoni Moda + Raleway.

- [ ] **Step 2: Update CSS properties and font references**

Replace `'Bebas Neue'` with `'Bodoni Moda', serif`, `'DM Sans'` with `'Raleway', sans-serif`, and `#e8ff00` with `#a07840`.

- [ ] **Step 3: Verify and commit**

```bash
git add index.html
git commit -m "style: unify index.html design system with Bodoni Moda + Raleway + gold palette"
```

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] Client page: paste a Spotify URL, see "Saved" with green flash, persists on refresh
- [ ] Client page: type in Additional Notes textarea, auto-saves after 1.5s
- [ ] Client page: per-section notes auto-save
- [ ] Client page: disconnect WiFi, make a change, see offline banner, reconnect, see sync
- [ ] Client page: if Supabase CDN blocked, see "Unable to Connect" overlay
- [ ] Admin page: create client, edit name/date/email, all show save feedback
- [ ] Admin page: toggle lock shows feedback
- [ ] Admin page: delete flow works with retry
- [ ] Admin page: send link has 60s cooldown
- [ ] Admin page: XSS sanitized (test with client name containing angle brackets)
- [ ] Both pages: connection status indicator shows when offline
- [ ] Locked overlay shows `chi@chiduly.com` not obfuscated text
