# Post-Wedding Recap Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only post-wedding "thank you" page that shows the couple's finalised music program plus their live dance set recordings hosted on Mixcloud, accessible via a secret link Chris sends manually.

**Architecture:** Recap mode is a URL param (`?recap=1`) on the existing `spotify-selections.html` page — no new file. Dance sets are stored as `wedding_selections` rows with `section_id = dance-set-{n}` (no schema change). Admin manages sets via a new collapsible panel in `admin.html`, identical in pattern to the existing Notes panel.

**Tech Stack:** Vanilla JS, Supabase JS client (already loaded), GitHub Pages static hosting. No build step.

---

## File Map

| File | Change |
|------|--------|
| `spotify-selections.html` | Detect `?recap=1`; transform page to thank-you header; hide editing UI; show dance sets section below brochure |
| `admin.html` | Add "Recap" button + collapsible panel per client; add/delete dance sets; copy recap URL to clipboard; show dot indicator when sets exist |

No new files. No schema changes. No edge functions.

---

## Data Convention

Dance sets are stored in `wedding_selections` with:

| Column | Value |
|--------|-------|
| `client_key` | same as all other rows for this client |
| `section_id` | `dance-set-1`, `dance-set-2`, ... (auto-incremented) |
| `spotify_url` | Mixcloud secret URL |
| `song_title` | set label (e.g. `"Dance Party"`) |
| `notes` | tracklisting — plain text, one track per line |

Deletion is a hard DELETE (not tombstone) because these are admin-managed, not client-managed.

---

## Task 1: Recap mode — page shell transform (`spotify-selections.html`)

**Files:**
- Modify: `spotify-selections.html`

Detect `?recap=1` early in the `DOMContentLoaded` handler and apply a CSS class that hides all editing UI, then inject a thank-you header above the brochure.

- [ ] **Step 1: Add `recap-mode` CSS class rules**

Find the `<style>` block. Add before `</style>`:

```css
/* ── Recap mode ─────────────────────────────────────────── */
body.recap-mode .music-section          { display: none !important; }
body.recap-mode #additional-notes-wrap  { display: none !important; }
body.recap-mode #admin-reply-display    { display: none !important; }
body.recap-mode #locked-overlay         { display: none !important; }
body.recap-mode #recap-sets-section     { display: block; }

#recap-sets-section { display: none; }

#recap-header {
  display: none;
  text-align: center;
  padding: 48px 24px 32px;
  max-width: 680px;
  margin: 0 auto;
}
body.recap-mode #recap-header { display: block; }

.recap-title {
  font-family: var(--font-display);
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  color: var(--champagne);
  margin: 0 0 12px;
}
.recap-subtitle {
  font-family: var(--font-body);
  font-size: 1rem;
  color: var(--muted);
  line-height: 1.7;
  margin: 0;
}
.recap-sets-title {
  font-family: var(--font-display);
  font-size: 1.3rem;
  color: var(--champagne);
  text-align: center;
  margin: 48px 0 24px;
  letter-spacing: 0.04em;
}
.recap-set-card {
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px 28px;
  margin-bottom: 20px;
}
.recap-set-label {
  font-family: var(--font-display);
  font-size: 1.1rem;
  color: var(--text);
  margin: 0 0 14px;
}
.recap-listen-btn {
  display: inline-block;
  padding: 10px 22px;
  border: 1px solid var(--champagne);
  border-radius: 6px;
  color: var(--champagne);
  font-family: var(--font-body);
  font-size: 0.85rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  text-decoration: none;
  transition: background 0.2s, color 0.2s;
  margin-bottom: 16px;
  display: block;
  width: fit-content;
}
.recap-listen-btn:hover {
  background: var(--champagne);
  color: var(--bg);
}
.recap-tracklist {
  font-family: var(--font-body);
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.8;
  white-space: pre-wrap;
  margin: 0;
  border-top: 1px solid var(--border);
  padding-top: 14px;
}
```

- [ ] **Step 2: Add recap header and sets section HTML**

Find `<div id="locked-overlay"` and insert directly after that closing `</div>`:

```html
<!-- Recap header (only visible in recap mode) -->
<div id="recap-header">
  <p class="recap-title" id="recap-couple-name"></p>
  <p class="recap-subtitle">Thank you for letting Chi Duly Productions be part of your wedding day.<br>Here's your music program, and the sets from the night.</p>
</div>

<!-- Dance sets (only visible in recap mode) -->
<div id="recap-sets-section" style="max-width:680px; margin:0 auto; padding:0 24px 64px;"></div>
```

- [ ] **Step 3: Detect recap mode in DOMContentLoaded**

Find the block starting with `const params = new URLSearchParams(window.location.search);` near the top of the `<script>`. Add immediately after:

```js
const isRecapMode = params.get('recap') === '1';
if (isRecapMode) document.body.classList.add('recap-mode');
```

- [ ] **Step 4: Populate recap couple name**

Immediately after the lines from Step 3:

```js
if (isRecapMode) {
  const coupleName = params.get('name') || '';
  const el = document.getElementById('recap-couple-name');
  if (el) el.textContent = coupleName;
}
```

- [ ] **Step 5: Verify in browser**

Open:
```
https://chidulyproductions.github.io/wedding-client-portal/spotify-selections.html?name=Madison+%26+Mitchell&date=2026-05-09&recap=1
```

Expected:
- All music section cards hidden
- Brochure card visible with their songs
- Thank-you header visible with couple name
- No locked overlay
- Dance sets section present but empty

- [ ] **Step 6: Commit**

```bash
cd "/Users/chiduly/00_CodeVibing/00_ClaudeCode/00_Wedding Business/Wedding Music Site"
git checkout -b feat/post-wedding-recap
git add spotify-selections.html
git commit -m "feat(recap): recap mode shell — hide editing UI, show thank-you header"
```

---

## Task 2: Render dance sets on the recap page (`spotify-selections.html`)

**Files:**
- Modify: `spotify-selections.html`

After `loadSelections()` runs, if in recap mode, fetch dance set rows and render them using safe DOM methods (no innerHTML with DB data).

- [ ] **Step 1: Add `loadRecapSets()` function**

Find `async function loadSelections()`. Directly after its closing `}`, add:

```js
async function loadRecapSets() {
  const clientKey = deriveClientKey();
  const { data, error } = await sb
    .from('wedding_selections')
    .select('section_id, spotify_url, song_title, notes')
    .eq('client_key', clientKey)
    .like('section_id', 'dance-set-%')
    .order('section_id');

  const container = document.getElementById('recap-sets-section');
  if (!container) return;
  container.textContent = '';

  if (error || !data || data.length === 0) return;

  const titleEl = document.createElement('p');
  titleEl.className = 'recap-sets-title';
  titleEl.textContent = 'The Dance Party';
  container.appendChild(titleEl);

  data.forEach(row => {
    const card = document.createElement('div');
    card.className = 'recap-set-card';

    const label = document.createElement('p');
    label.className = 'recap-set-label';
    label.textContent = row.song_title || 'Dance Set';
    card.appendChild(label);

    if (row.spotify_url) {
      const btn = document.createElement('a');
      btn.className = 'recap-listen-btn';
      btn.href = row.spotify_url;
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      btn.textContent = 'Listen on Mixcloud ↗';
      card.appendChild(btn);
    }

    if (row.notes && row.notes.trim()) {
      const tl = document.createElement('pre');
      tl.className = 'recap-tracklist';
      tl.textContent = row.notes.trim();
      card.appendChild(tl);
    }

    container.appendChild(card);
  });
}
```

- [ ] **Step 2: Call `loadRecapSets()` after `loadSelections()`**

Find where `loadSelections()` is called in the init flow. After it, add:

```js
if (isRecapMode) loadRecapSets();
```

- [ ] **Step 3: Commit**

```bash
git add spotify-selections.html
git commit -m "feat(recap): load and render dance sets on recap page"
```

---

## Task 3: Dance sets panel in admin (`admin.html`)

**Files:**
- Modify: `admin.html`

Add a "Recap" button per client row that opens a collapsible panel. The panel uses safe DOM methods throughout — no innerHTML with DB data.

- [ ] **Step 1: Add CSS for the recap panel**

Find `.notes-row` CSS in admin.html. Add after it:

```css
.recap-row {
  display: none;
  background: #0f0d13;
  border-top: 1px solid #2a2730;
  padding: 20px 24px;
}
.recap-row.open { display: table-row; }
.recap-row td { padding: 0; }
.recap-row-inner { padding: 4px 0 8px; }
.recap-set-entry {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid #2a2730;
}
.recap-set-entry:last-of-type { border-bottom: none; }
.recap-set-meta { flex: 1; font-size: 0.85rem; color: #c8b99a; }
.recap-set-meta strong { display: block; margin-bottom: 2px; font-weight: 600; }
.recap-set-meta a { color: #8fa87d; font-size: 0.8rem; word-break: break-all; }
.recap-set-meta pre { margin: 6px 0 0; font-size: 0.78rem; color: #7a7275; white-space: pre-wrap; font-family: inherit; }
.recap-add-form { margin-top: 16px; }
.recap-add-form input,
.recap-add-form textarea {
  width: 100%;
  background: #1a1720;
  border: 1px solid #3e3a45;
  border-radius: 6px;
  color: #f0ecf5;
  padding: 8px 12px;
  font-size: 0.85rem;
  font-family: inherit;
  margin-bottom: 8px;
  box-sizing: border-box;
}
.recap-add-form textarea { min-height: 90px; resize: vertical; }
.recap-copy-link {
  display: inline-block;
  margin-top: 16px;
  padding: 7px 16px;
  border: 1px solid #8fa87d;
  border-radius: 6px;
  color: #8fa87d;
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  background: none;
  font-family: inherit;
}
.recap-copy-link:hover { background: #8fa87d; color: #0b0a0e; }
```

- [ ] **Step 2: Add recap JS functions**

Find `function toggleNotesRow(id)`. Add the following block directly after its closing `}`:

```js
function toggleRecapRow(id) {
  const row = document.getElementById('recap-row-' + id);
  if (!row) return;
  const isOpen = row.classList.toggle('open');
  if (isOpen) loadAdminRecapSets(id);
}

async function loadAdminRecapSets(clientId) {
  const container = document.getElementById('recap-sets-' + clientId);
  if (!container) return;
  container.textContent = '';

  const row = document.getElementById('recap-row-' + clientId);
  const clientKey = row?.dataset.clientKey;
  if (!clientKey) return;

  const { data, error } = await sb
    .from('wedding_selections')
    .select('section_id, spotify_url, song_title, notes')
    .eq('client_key', clientKey)
    .like('section_id', 'dance-set-%')
    .order('section_id');

  if (error || !data || data.length === 0) {
    const msg = document.createElement('em');
    msg.style.cssText = 'color:#7a7275;font-size:0.82rem;';
    msg.textContent = 'No sets yet.';
    container.appendChild(msg);
    return;
  }

  data.forEach(row => {
    const entry = document.createElement('div');
    entry.className = 'recap-set-entry';

    const meta = document.createElement('div');
    meta.className = 'recap-set-meta';

    const strong = document.createElement('strong');
    strong.textContent = row.song_title || 'Dance Set';
    meta.appendChild(strong);

    if (row.spotify_url) {
      const link = document.createElement('a');
      link.href = row.spotify_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = row.spotify_url;
      meta.appendChild(link);
    }

    if (row.notes && row.notes.trim()) {
      const pre = document.createElement('pre');
      pre.textContent = row.notes.trim();
      meta.appendChild(pre);
    }

    entry.appendChild(meta);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'action-btn delete';
    removeBtn.style.flexShrink = '0';
    removeBtn.textContent = 'Remove';
    removeBtn.onclick = () => deleteRecapSet(clientId, clientKey, row.section_id);
    entry.appendChild(removeBtn);

    container.appendChild(entry);
  });
}

async function addRecapSet(clientId) {
  const recapRow = document.getElementById('recap-row-' + clientId);
  const clientKey = recapRow?.dataset.clientKey;
  if (!clientKey) return;

  const labelInput = document.getElementById('recap-label-' + clientId);
  const urlInput   = document.getElementById('recap-url-'   + clientId);
  const tlInput    = document.getElementById('recap-tl-'    + clientId);

  const label = labelInput?.value.trim();
  const url   = urlInput?.value.trim();
  const tl    = tlInput?.value.trim();

  if (!label || !url) { showActionMsg('Set label and Mixcloud URL are required.', 'error'); return; }

  const { data: existing } = await sb
    .from('wedding_selections')
    .select('section_id')
    .eq('client_key', clientKey)
    .like('section_id', 'dance-set-%');

  const nums = (existing || [])
    .map(r => parseInt(r.section_id.replace('dance-set-', ''), 10))
    .filter(n => !isNaN(n));
  const nextN = nums.length ? Math.max(...nums) + 1 : 1;

  const { error } = await sb.from('wedding_selections').upsert({
    client_key: clientKey,
    section_id: 'dance-set-' + nextN,
    spotify_url: url,
    song_title: label,
    artist: null,
    notes: tl || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'client_key,section_id' });

  if (error) { showActionMsg('Failed to save set: ' + error.message, 'error'); return; }

  if (labelInput) labelInput.value = '';
  if (urlInput)   urlInput.value   = '';
  if (tlInput)    tlInput.value    = '';

  updateRecapIndicator(clientId, true);
  loadAdminRecapSets(clientId);
  showActionMsg('Dance set added.', 'success');
}

async function deleteRecapSet(clientId, clientKey, sectionId) {
  const { error } = await sb
    .from('wedding_selections')
    .delete()
    .eq('client_key', clientKey)
    .eq('section_id', sectionId);

  if (error) { showActionMsg('Failed to remove set: ' + error.message, 'error'); return; }

  const { data: remaining } = await sb
    .from('wedding_selections')
    .select('section_id')
    .eq('client_key', clientKey)
    .like('section_id', 'dance-set-%');

  updateRecapIndicator(clientId, !!(remaining && remaining.length));
  loadAdminRecapSets(clientId);
  showActionMsg('Set removed.', 'success');
}

function updateRecapIndicator(clientId, hasSets) {
  const btn = document.getElementById('recap-btn-' + clientId);
  if (btn) btn.textContent = hasSets ? 'Recap ●' : 'Recap';
}

function copyRecapLink(name, date) {
  const base = 'https://chidulyproductions.github.io/wedding-client-portal/spotify-selections.html';
  const url = base + '?name=' + encodeURIComponent(name) + '&date=' + encodeURIComponent(date) + '&recap=1';
  navigator.clipboard.writeText(url).then(() => showActionMsg('Recap link copied!', 'success'));
}
```

- [ ] **Step 3: Add "Recap" button to each client row in the render loop**

Find the line that renders the "Notes" button (search for `toggleNotesRow`):

```js
<button class="action-btn" onclick="toggleNotesRow('${c.id}')">Notes${hasNote ? ' ●' : ''}</button>
```

Add a Recap button directly after it:

```js
<button class="action-btn" id="recap-btn-${c.id}" onclick="toggleRecapRow('${c.id}')">Recap${hasRecapSets[c.id] ? ' ●' : ''}</button>
```

- [ ] **Step 4: Add recap panel row after the notes panel row**

Find the notes-row `<tr>` block in the render loop:

```js
<tr id="notes-row-${c.id}" class="notes-row">
  ...
</tr>
```

Add directly after it. Note: `clientKey` is the derived key used in the same render loop — check the exact variable name in the render loop (search for `.replace(/[^a-z0-9-]/g, '-')`) and match it:

```js
<tr id="recap-row-${c.id}" class="recap-row" data-client-key="${clientKey}">
  <td colspan="6">
    <div class="recap-row-inner">
      <div id="recap-sets-${c.id}" style="margin-bottom:16px;"></div>
      <div class="recap-add-form">
        <input id="recap-label-${c.id}" type="text" placeholder="Set label (e.g. Dance Party)" />
        <input id="recap-url-${c.id}" type="url" placeholder="Mixcloud secret URL" />
        <textarea id="recap-tl-${c.id}" placeholder="Tracklisting (optional) — one track per line&#10;1. Artist – Track Name&#10;2. ..."></textarea>
        <button class="action-btn" onclick="addRecapSet('${c.id}')">Add Set</button>
      </div>
      <button class="recap-copy-link" onclick="copyRecapLink(${JSON.stringify(c.name)}, ${JSON.stringify(c.wedding_date)})">Copy Recap Link</button>
    </div>
  </td>
</tr>
```

Note: `JSON.stringify()` is used for the `copyRecapLink` args to safely handle apostrophes and special chars in couple names.

- [ ] **Step 5: Pre-fetch recap indicator when loading clients**

In `loadClients()`, find where `notesMap` is built from `notesData`. Directly after that block, add:

```js
const allClientKeys = data.map(c =>
  (c.name + '-' + c.wedding_date).toLowerCase().replace(/[^a-z0-9-]/g, '-')
);
const { data: recapData } = await sb
  .from('wedding_selections')
  .select('client_key')
  .in('client_key', allClientKeys)
  .like('section_id', 'dance-set-%');

const hasRecapSets = {};
(recapData || []).forEach(r => { hasRecapSets[r.client_key] = true; });
```

Then in the render loop, find where `clientKey` is derived for each client (match the exact derivation used in the render loop) — pass `hasRecapSets[clientKey]` to the Recap button indicator (already wired in Step 3 above).

- [ ] **Step 6: Verify in browser**

1. Open `admin.html`, log in
2. Click "Recap" on any client — panel opens, shows "No sets yet"
3. Fill in label + Mixcloud URL + tracklisting → "Add Set"
4. Set appears; button shows "Recap ●"
5. Click "Copy Recap Link" → clipboard has correct URL
6. Open that URL — recap page shows thank-you header, brochure, dance set card with link and tracklisting
7. Remove the set — indicator clears

- [ ] **Step 7: Commit**

```bash
git add admin.html
git commit -m "feat(recap): add dance sets panel and recap link to admin dashboard"
```

---

## Task 4: End-to-end verification + deploy

- [ ] **Step 1: Full end-to-end test with Blah and Blahbia**

In admin.html, add a test set to Blah and Blahbia:
- Label: `Dance Party`
- URL: `https://www.mixcloud.com/` (placeholder for testing)
- Tracklisting:
```
1. Beyoncé – Crazy In Love
2. Bruno Mars – Uptown Funk
3. Drake – One Dance
```

Open the copied recap link. Verify everything looks correct visually.

- [ ] **Step 2: Clean up test data**

Remove the test set via admin panel.

- [ ] **Step 3: Push and open PR**

```bash
git push -u origin feat/post-wedding-recap
gh pr create --title "feat: post-wedding recap page" --body "$(cat <<'EOF'
## Summary
- New recap mode on spotify-selections.html via ?recap=1 URL param
- Hides all editing UI; shows read-only brochure + dance sets
- Admin can add/remove Mixcloud dance sets per client (label, URL, tracklisting)
- Copy Recap Link button in admin generates the shareable URL
- No schema changes, no new files

## Test plan
- [ ] Open recap URL for a client with no sets — brochure shows, dance section empty
- [ ] Add a set in admin — recap page shows set card with link and tracklisting
- [ ] Copy Recap Link — URL is correct format
- [ ] Remove set — indicator clears, recap page shows no sets

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 4: Update TODOS.md after merge**

Remove the "Post-Wedding Thank-You Page" entry.

---

## Self-Review

**Spec coverage:**
- Same portal, recap mode via `?recap=1` — Task 1
- Admin pastes Mixcloud URL — Task 3
- Read-only brochure in recap view — Task 1 (editing UI hidden, brochure stays)
- Dance floor tracklisting display — Task 2
- Mixcloud link button — Task 2 (link not embed — secret embeds are unreliable)
- Chris sends link manually — Task 3 Copy Recap Link button
- No public profile exposure — just a URL
- No schema changes — dance-set rows reuse existing wedding_selections table
- No new files

**Placeholder scan:** None. All code blocks complete.

**Type/name consistency:** `loadAdminRecapSets` defined in Task 3 Step 2, called in `toggleRecapRow` in same step. `deleteRecapSet` defined and wired via `onclick` in same step. `copyRecapLink` uses `JSON.stringify` for safe arg passing. `hasRecapSets` built in Step 5 and consumed in Step 3.
