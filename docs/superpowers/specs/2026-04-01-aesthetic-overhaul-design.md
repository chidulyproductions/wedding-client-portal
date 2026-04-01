# Aesthetic Overhaul — Client Portal (spotify-selections.html)

## Objective

Transform the client portal from "functional GitHub-hosted HTML form" to "premium luxury wedding experience worth $20K." The site should feel like a high-end wedding invitation, not a SaaS dashboard.

## Scope

- **In scope:** `spotify-selections.html` — CSS reskin + minimal decorative HTML additions
- **Out of scope:** `admin.html` (stays as-is), `index.html` (legacy, not in use)
- **Branch:** `redesign/client-portal`

## Approach: CSS Reskin + Minimal HTML Decoration (Approach B)

Rewrite the `<style>` block entirely. Add purely decorative HTML elements (dividers, ornamental spans, animation wrappers). Zero changes to functional HTML — all IDs, classes, forms, JS, anchor links, saved states, undo buttons, upload logic, and functionality remain 100% untouched.

---

## Design References

| Source | What to pull from it |
|--------|---------------------|
| **Paperless Post** (premium tier) | Restraint principle — metallic foil accents on thin lines and borders, not large fills. Romantic calligraphy paired with clean sans-serif body text. Warm whites, champagne, muted blush. |
| **Taylor Swift "Lover" era** | Dreamy pastel palette — blush pink `#FDC0CC`, lavender `#D5B9E4`, pale gold `#FEEFC4`. Romantic maximalism. High-contrast serif typography (Pistilli Roman energy). |
| **Sabrina Carpenter "Short n Sweet"** | Editorial magazine layout — each section feels like a spread in a luxury booklet. Vintage glamour, retro display typography. Candy pastels punctuated by bold accent moments. |
| **Manual Labor (manual-labor.com)** | "Living breathing blueprint" energy — animated text fly-ins, elements that draw themselves in, stagger-reveal sequences. The page feels alive and curated, like a calligrapher is working on it in real time. |
| **Rose gold CSS techniques** | Metallic gradient: `linear-gradient(135deg, #B76E79 0%, #F7E7CE 50%, #B76E79 100%)`. Use on buttons, accent borders, decorative lines. Avoid large fills. |

---

## Color System

### Base canvas
| Token | Value | Usage |
|-------|-------|-------|
| Background | `#F8F1E9` | Page background (warm ivory) |
| Card glass | `rgba(255, 255, 255, 0.25)` | Selection card backgrounds |
| Warm glow | `radial-gradient(ellipse at 50% 0%, #FDF6F0, #F8F1E9 70%)` | Subtle top-center warmth under noise overlay |

### Primary accents
| Token | Value | Usage |
|-------|-------|-------|
| Rose gold gradient | `linear-gradient(135deg, #B76E79 0%, #F7E7CE 50%, #B76E79 100%)` | Primary CTA buttons, accent borders, decorative lines |
| Rose gold solid | `#B76E79` | Text accents where gradients don't work |
| Blush pink | `#FDC0CC` | Soft highlight backgrounds, hover states, badges |

### Supporting tones
| Token | Value | Usage |
|-------|-------|-------|
| Champagne gold | `#F7E7CE` | Secondary accent, saved pill text, success states |
| Lavender mist | `#D5B9E4` | Subtle section group differentiation (Lover palette) |
| Warm charcoal | `#2D2D2D` | Primary text color |
| Muted rose | `#9A8A8E` | Secondary/caption text |

### Texture layer
- Keep existing SVG `feTurbulence` noise overlay (opacity 0.03, visual 0.15)
- Add warm radial gradient underneath the noise

---

## Typography

3-font stack loaded via Google Fonts CDN:

| Role | Font | Size | Weight | Style | Tracking | Usage |
|------|------|------|--------|-------|----------|-------|
| Script | Allura | `clamp(2.5rem, 6vw, 4rem)` | 400 | normal | normal | Couple's names only |
| Display serif | Playfair Display | 1.1-1.3rem | 400, 700, 700i | italic for titles | 0.02em | Headings, section titles, button text |
| Sans-serif | DM Sans | 0.7-0.95rem | 300, 400, 500, 700 | normal | 0.2em (labels) | Body, UI, labels, badges |

Replaces: Bodoni Moda -> Playfair Display, Raleway -> DM Sans, adds Allura for script.

---

## Brochure / Program Card (The Hero)

This is the centerpiece — the first thing clients see. Should feel like a luxury wedding invitation.

### Container
- Background: solid `#FFFDF7` (warmer than page canvas)
- Border: `1px solid #B76E79` (thin rose gold)
- Border-radius: `20px`
- Box-shadow: `0 16px 48px rgba(183, 110, 121, 0.12)`
- Padding: `48px 40px` (desktop), `32px 24px` (mobile)
- No glassmorphism — distinct from selection cards

### Couple's names (showstopper moment)
- Allura script, `clamp(2.5rem, 6vw, 4rem)`
- Rose gold gradient text: `background: linear-gradient(135deg, #B76E79, #F7E7CE, #B76E79)` with `background-clip: text` / `-webkit-background-clip: text`
- Animate in: gentle fly-up + fade on page load (700ms delay)
- Decorative thin rose gold `<hr>` rule underneath

### "Wedding Music Program" title
- Playfair Display, italic, `1.3rem`
- Warm charcoal `#2D2D2D`

### Wedding date
- DM Sans, `0.8rem`, uppercase, `0.2em` tracking
- Muted rose `#9A8A8E`

### Program list
- Category headings (Ceremony, Reception, etc.): Playfair Display italic, lavender mist `#D5B9E4`
- Moment rows: DM Sans, dot-leader pattern (moment ......... song title)
- "Make Selection" links: rose gold text, underline draws left-to-right on hover
- Completed songs: champagne gold heart icon next to song title

### Decorative elements (new HTML)
- Small SVG heart motifs flanking couple's names — draw in via CSS stroke animation (800ms)
- Thin ornamental divider between program sections — rose gold line with small heart at center
- Subtle sparkle keyframe animation on couple's names on hover

### "Alive" feel (Manual Labor inspiration)
- Program sections stagger-reveal on load — each category slides up with 100ms delay between
- Ornamental dividers draw from center outward (CSS `stroke-dasharray` animation)
- Overall effect: feels like a calligrapher hand-writing the program as you watch

---

## Selection Cards (Functional Luxury)

Restrained compared to brochure — polished but not show-stopping.

### Glass card base
- Background: `rgba(255, 255, 255, 0.25)`
- Border: `1px solid rgba(255, 255, 255, 0.4)`
- `backdrop-filter: blur(12px)` + `-webkit-backdrop-filter: blur(12px)`
- Border-radius: `16px`
- Box-shadow: `0 8px 32px rgba(183, 110, 121, 0.08)` (rose-tinted)
- Top border: `1px solid #B76E79` (thin rose gold, unified for all card types)

### `@supports` fallback (no backdrop-filter)
- Background: `rgba(255, 252, 248, 0.92)` (nearly opaque warm white)
- Same border-radius and shadow, no blur

### Hover state
- Box-shadow expands: `0 12px 40px rgba(183, 110, 121, 0.15)`
- `transform: scale(1.005)` — barely perceptible
- Transition: `300ms ease`

### Section header
- Title: Playfair Display italic
- Badge: DM Sans, uppercase, `0.65rem`, blush pink `#FDC0CC` background, warm charcoal text, rounded pill
- Bottom border: `1px solid rgba(183, 110, 121, 0.2)` (rose gold tint)

### Input row
- Text input: `border-radius: 10px`, `1px solid rgba(183, 110, 121, 0.2)`
- Focus: `box-shadow: 0 0 0 2px rgba(183, 110, 121, 0.3)` (rose gold glow)
- Placeholder: muted rose, italic

### Primary CTA buttons (Add/Save)
- Rose gold gradient background
- Glow: `box-shadow: 0 4px 16px rgba(183, 110, 121, 0.3)`
- Hover: glow intensifies, `scale(1.03)`
- Playfair Display, `0.9rem`

### Secondary buttons (Clear, Remove)
- Ghost style: transparent, thin rose gold outline
- No glow, muted opacity
- Hover: fills `rgba(183, 110, 121, 0.08)`

### Saved pill
- Champagne gold text, no background fill
- Heart icon instead of checkmark: "&#9829; Saved"

### Embeds (Spotify/YouTube iframes)
- `border-radius: 10px`
- Subtle inset shadow to blend with glass card

---

## Decorative Elements & Animations

### Page load sequence
1. Background warm gradient fades in (200ms)
2. Header slides down into place (300ms)
3. Brochure card fades up from below (500ms, ease-out)
4. Couple's names fly-up + fade (700ms)
5. Heart motifs draw in via SVG stroke animation (800ms)
6. Ornamental dividers draw from center outward (900ms)
7. Program categories stagger-reveal, 100ms apart
8. Selection cards stagger-reveal, 80ms apart

### Micro-interactions
- Couple's names: shimmer on hover (gradient position shift)
- "Make Selection" links: underline draws left-to-right on hover
- Primary CTA buttons: glow pulses on hover
- Section group dividers: thin rose gold `<hr>` with heart SVG at center

### New decorative HTML elements (~15-20 total)
- `<span class="heart-ornament">` — SVG hearts flanking couple names
- `<hr class="rose-divider">` — between section groups (Ceremony, Reception, etc.)
- `<span class="sparkle">` — CSS-only sparkle keyframes on brochure card

### Reduced motion
- `@media (prefers-reduced-motion: reduce)` — all animations instant, no fly-in/stagger/shimmer, just final state

### Performance guardrails
- Animations use `transform` and `opacity` only (GPU-composited)
- No more than 3 animated properties per element
- Sparkle/shimmer via CSS keyframes, not JS
- Backdrop-filter used only on selection cards, not brochure

---

## Responsive Behavior

### Desktop (>700px)
- Brochure: max-width 620px, centered, 48px padding
- Selection cards: flexible within 1100px container
- Full glassmorphic blur active
- All animations play

### Mobile (<=700px)
- Brochure: full-width, 24px side padding
- Couple's names scale via clamp, stay prominent
- Selection cards: full-width, stacked
- Glass blur stays active (modern phones handle it)
- Border-radius reduces to 12px
- Stagger delays shortened, no hover effects (touch)
- Heart ornaments scale down but stay visible

### Touch considerations
- All buttons: minimum 44px touch target
- Input fields: 48px height on mobile
- Adequate tap spacing between Clear/Remove buttons

---

## DO NOT CHANGE

### HTML structure
- All element IDs, classes, and nesting
- All `<form>`, `<input>`, `<textarea>`, `<button>` elements
- All `<iframe>` embed containers
- All anchor links (`#section-*`)

### JavaScript
- Zero modifications to any `<script>` block
- Supabase client, save/load logic, oEmbed calls
- Custom moment creation, undo/redo, clear, remove flows
- Lock overlay logic
- Auto-save debounce timers

### Functional CSS selectors
- `display: none` / `.visible` toggle patterns that JS relies on
- `.undo-bar.visible`, `.manual-display.visible`, etc.
- z-index stacking for lock overlay

### Content
- All section names, descriptions, placeholder text, badge labels
- Sample playlists section
- Additional notes section
- Announcement section

**The rule:** If JS references it or a user interacts with it, the structure is untouchable. Only layer new styles on top and add purely decorative elements alongside.

---

## Completion celebration

When a future progress indicator is added (see TODOS.md), replace the originally-specced confetti animation with a rose gold shimmer burst or elegant particle effect consistent with this aesthetic.

---

## Files to modify
- `spotify-selections.html` — rewrite `<style>` block, add Google Fonts `<link>` tags in `<head>`, add decorative HTML elements

## Files NOT to modify
- `admin.html`
- `index.html`
- `netlify/functions/*`
- `supabase/functions/*`
- All JS within `spotify-selections.html`
