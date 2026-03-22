# Design System — Chi Duly Productions Wedding Portal

## Brand Identity
A premium wedding DJ client portal. The design communicates elegance, warmth, and intentionality — like a handwritten invitation, not a SaaS dashboard. Every pixel should feel like it belongs at a wedding.

## Color Tokens

### Client Portal — Light Mode (default)
```
--background:  #f5f0ea   warm cream
--card:        #faf6f1   off-white
--text:        #1a1218   near-black warm
--accent:      #a07840   gold/bronze
--blush:       #b06878   rose/mauve (highlights, song titles, CTAs)
--gray:        #7a7275   muted text
--border:      #ddd8d2   light border
--green:       #a07840   same as accent (gold = success)
```

### Client Portal — Dark Mode
```
--background:  #1a1218   warm dark (NOT pure black)
--card:        #231e26   slightly lighter
--text:        #f5f0ea   warm cream (inverse of light)
--accent:      #c49050   gold, brightened for dark bg
--blush:       #d0889a   rose, brightened for contrast
--gray:        #9a9295   muted text, brightened
--border:      #3a3438   subtle warm border
```

### Admin Dashboard — Dark Theme
```
--bg:          #0e0c0f   deep purple-black
--card:        #1a1720   dark card
--border:      #2e2a35   subtle purple border
--text:        #f0ecf5   light lavender white
--muted:       #7a7385   gray-purple
--accent:      #a07840   gold (matches client portal)
--blush:       #b06878   rose (matches client portal)
--green:       #4caf7d   success green
```

### Landing Page — Dark Theme
```
--black:       #0a0a0a
--white:       #f5f5f0
--accent:      #e8ff00   neon yellow-green
--mid:         #1a1a1a
--gray:        #888
```

## Typography

### Font Stack
- **Display/Headings:** Bodoni Moda (Google Fonts) — serif, italic for emphasis
- **Body/UI:** Raleway (Google Fonts) — sans-serif, weights 200-800
- **Landing page:** Bebas Neue (display) + DM Sans (body)

### Type Scale
| Role | Font | Size | Weight | Style | Tracking |
|------|------|------|--------|-------|----------|
| Display | Bodoni Moda | 2.5rem (40px) | 700 | italic | normal |
| Page title | Bodoni Moda | 2rem (32px) | 700 | italic | normal |
| Section group | Bodoni Moda | 1.5rem (24px) | 400 | italic | normal |
| Section title | Raleway | 0.85rem (13.6px) | 600 | uppercase | 0.2em |
| Body | Raleway | 0.95rem (15.2px) | 300 | normal | normal |
| Caption | Raleway | 0.8rem (12.8px) | 300 | italic | normal |
| Badge | Raleway | 0.7rem (11.2px) | 600 | uppercase | 0.2em |

## Spacing Scale
Based on 4px grid (Tailwind default):
| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Badge padding, tight gaps |
| sm | 8px | Compact element spacing |
| md | 12px | Standard element gap |
| base | 16px | Card padding, section spacing |
| lg | 24px | Between sections |
| xl | 32px | Between section groups |
| 2xl | 48px | Between major page sections |
| 3xl | 64px | Hero/brochure vertical padding |

## Animation & Motion
| Animation | Duration | Easing | Usage |
|-----------|----------|--------|-------|
| Fade-in | 200ms | ease-out | Saved pill, embed appear, toast |
| Transition | 150ms | ease | Hover states, focus, button press |
| Dark mode | 200ms | ease | Full theme transition |
| Progress ring | 500ms | ease-out | Ring fill on selection save |
| Celebration | 1200ms | custom | Confetti + gold ring at 100% |
| Stagger | 50ms/item | ease-out | Page load entrance animations |
| Realtime flash | 300ms | ease | Highlight on partner's change |

## Visual Texture
- Subtle noise/grain overlay on body via SVG `feTurbulence` filter (opacity 0.03, visual opacity ~0.15)
- Cards have 3px top accent border (gold for standard, blush for special sections)
- Section type indicated by pill badges with colored backgrounds
- Smooth scroll behavior on all internal navigation

## Component Patterns

### Selection Card
- White card on cream background, 3px top accent border
- Section header: title (uppercase, tracked) + type badge (Song Link / Playlist Link)
- Input row: text input + "upload" button (blush color for emphasis)
- Embed area: responsive iframe (152px for track, 380px for playlist)
- Saved pill: "✓ Song Saved" — fades in on save, gold text
- Clear button: appears after selection, muted style
- Remove button (🗑): top-right, triggers section hide + undo bar

### Brochure / Program
- Centered card, distinct from selection cards (no top accent, larger padding)
- Couple names: Display type, Bodoni Moda italic
- Section list: dot-leader pattern (moment ......... song title)
- "Make Selection" links: blush color, scroll to corresponding section
- Progress ring: inside brochure header, gold fill animation

### Toast Notifications
- Bottom-right position, stacked
- Success: gold accent border
- Error: blush/red accent border
- Auto-dismiss: 5 seconds (errors persist until dismissed)
- Subtle slide-up entrance animation

## Accessibility Requirements
- All interactive elements: minimum 44px touch targets
- Color contrast: WCAG AA minimum (4.5:1 for text, 3:1 for UI)
- Keyboard navigation: Tab through all inputs, Enter to submit, Escape to dismiss modals
- Focus indicators: 2px gold outline on focus-visible
- Screen reader: ARIA labels on icon-only buttons (🗑 → "Remove section"), live regions for toast notifications
- Reduced motion: Respect prefers-reduced-motion — disable animations, keep instant transitions

## Responsive Strategy
- Mobile-first (Tailwind default)
- Breakpoints: sm (640px), md (768px), lg (1024px)
- Selection cards: full-width on mobile, max-width 720px centered on desktop
- Brochure: full-width mobile, max-width 600px on desktop
- Admin table: horizontal scroll on mobile, full table on desktop
- Embed iframes: 100% width, aspect-ratio maintained
