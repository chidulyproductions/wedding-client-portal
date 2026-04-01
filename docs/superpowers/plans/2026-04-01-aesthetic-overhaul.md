<!-- /autoplan restore point: /Users/chiduly/.gstack/projects/chidulyproductions-wedding-client-portal/redesign-client-portal-autoplan-restore-20260401-004024.md -->
# Implementation Plan — Aesthetic Overhaul (spotify-selections.html)

**Branch:** `redesign/client-portal`
**Spec:** `docs/superpowers/specs/2026-04-01-aesthetic-overhaul-design.md`
**Target:** `spotify-selections.html` — CSS reskin + minimal decorative HTML additions

---

## Objective

Transform the client portal from "functional GitHub-hosted HTML form" to "premium luxury wedding experience worth $20K."

---

## Approach

CSS Reskin + Minimal HTML Decoration (Approach B from spec). Rewrite `<style>` block entirely. Add purely decorative HTML elements. Zero changes to functional HTML — all IDs, classes, forms, JS, and anchor links remain 100% untouched.

---

## Implementation Steps

### Step 1: Checkout and prep
- Confirm on branch `redesign/client-portal`
- Read current `spotify-selections.html` fully

### Step 2: Google Fonts swap
In `<head>`, replace:
```html
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:...&family=Raleway:...&display=swap" rel="stylesheet" />
```
With:
```html
<link href="https://fonts.googleapis.com/css2?family=Allura&family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=DM+Sans:wght@300;400;500;700&display=swap" rel="stylesheet" />
```

### Step 3: Rewrite `<style>` block
Complete replacement of all CSS with:
- New `:root` tokens (ivory background, rose gold, champagne, lavender)
- Warm radial gradient under noise overlay
- Brochure card: solid `#FFFDF7`, thin rose gold border, no glassmorphism
- Selection cards: glassmorphic with `backdrop-filter: blur(12px)`
- `@supports` fallback for no backdrop-filter
- All animation keyframes (fly-up, draw-in, stagger, shimmer)
- `@media (prefers-reduced-motion: reduce)` canceling all animations
- Responsive breakpoint at 700px

### Step 4: Add decorative HTML (purely decorative)
- SVG heart ornaments flanking couple names in `.program-couple`
- `<hr class="rose-divider">` between program section groups
- `<span class="sparkle">` on brochure card hero area
- Wrapper divs for stagger-reveal animation sequencing

### Step 5: Verify functional integrity
- All IDs, classes, forms untouched
- JS behavior unchanged (save/load/undo/clear/remove)
- Lock overlay still works
- All anchor links still scroll to correct sections

---

## Files Modified
- `spotify-selections.html` — CSS rewrite + decorative HTML only

## Files NOT Modified
- `admin.html`
- `index.html`
- `netlify/functions/*`
- `supabase/functions/*`

---

## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | Accept "CSS reskin only" constraint | P3, P5 | Functional JS is load-bearing; reskin achieves goal with zero risk | Full rebuild |
| 2 | CEO | Hold scope — no expansions | P3 | Tight blast radius; expansions risk breaking JS | Admin overhaul |
| 3 | CEO | Accept rose gold palette despite trend risk | P6 | Spec's restraint language mitigates; wedding = timeless romantic | Neutral palette |
| 4 | CEO | Flag font preload as required addition to Step 2 | P1 | FOUT is real UX degradation on first load | Skip preload |
| 5 | CEO | Defer print styles to TODOS | P3 | Out of scope; not blocking luxury feel goal | In scope |
| 6 | Design | Cap selection card stagger at 28ms/card | P5 | 80ms × 18 cards = 1.4s tail — too long | 80ms |
| 7 | Design | Preserve and restyle lock overlay in CSS rewrite | P1 | Lock overlay is functional and must survive | Skip |
| 8 | Design | Add min-height: 44px to .program-make-selection | P1 | Touch tap target per spec's own rules | Skip |
| 9 | Design | Accept lavender contrast as advisory (decorative use) | P3 | Acceptable for large-text category labels | Darken |
| 10 | Eng | --blush: #B76E79 (not #FDC0CC) in new :root | P1 | JS: song.style.color=var(--blush) — must be legible on ivory | #FDC0CC |
| 11 | Eng | --blush-light: #FDC0CC for badge backgrounds | P5 | Explicit token for backgrounds vs text | Overload --blush |
| 12 | Eng | --accent: #B76E79 — must be defined | P1 | 5+ inline styles reference var(--accent); undefined = broken | Remove |
| 13 | Eng | --muted: #9A8A8E — fix pre-existing bug | P1 | var(--muted) used in inline styles, never defined | Skip |
| 14 | Eng | --font-body: 'DM Sans' — fix pre-existing bug | P1 | var(--font-body) used in .manual-title-input | Skip |
| 15 | Eng | Override #section-announcement via CSS specificity | P1 | Inline dark bg clashes; CSS override = no HTML change | Leave dark |

---

## Cross-Phase Themes

**Theme: Stagger animation approach** — flagged in Phase 3 (primary) AND eng subagent independently.
Current CSS hard-codes nth-child(1-5). With 15+ sections + dynamic custom moments, this breaks silently. Resolution: use `animation-delay: calc(var(--card-index, 0) * 28ms)` with inline `--card-index` set per card. High-confidence — both reviewers caught it independently.

**Theme: CSS display:none base states for .visible pattern** — flagged in Phase 3 AND eng subagent.
New CSS must explicitly set `display: none` on base state for all `.visible`-toggled elements. If any new style accidentally sets `display: flex/block` on the base rule, JS toggle breaks. Resolution: treat as a checklist in implementation.

**Theme: Lock overlay font inconsistency** — flagged by eng subagent and design review.
Lock overlay uses inline Bodoni Moda/Raleway — will mismatch after rewrite. Deferred to TODOS.md as P3 (overlay is functional, not client-facing during design sessions).

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | ✅ clean | 5 decisions, 0 critical blockers |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | ⚠️ findings | 6 bugs found (2 critical CSS vars) |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | ⚠️ findings | 7.9/10 avg score, stagger + missing states |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | ⏭ skipped | OpenAI 401 — API not configured |

**VERDICT:** APPROVED WITH FIXES — 15 auto-decisions made. 2 critical CSS variable bugs (--blush, --accent) must be resolved in implementation. 3 items deferred to TODOS.md. Ready to execute.

