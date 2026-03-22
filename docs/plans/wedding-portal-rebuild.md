# Chi Duly Productions — Wedding DJ Portal Rebuild Plan

> **Reviewed:** CEO Review (CLEAR), Eng Review (CLEAR), Design Review (CLEAR)
> **Date:** 2026-03-20 | **Branch:** main | **Commit:** b299c42
> **Jira Tickets:** See [Jira Epic & Tickets](#jira-tickets) at bottom

---

## Project Overview

A custom wedding DJ client portal for **Chi Duly Productions**. Clients receive a personalized link to select music for every moment of their wedding day. The DJ manages clients from an admin dashboard.

**This is a full rebuild** of the original static HTML/JS site (3,632 lines across 3 files) into a modern Next.js application with expanded features.

### Vision (CEO Review)
The 10x version isn't just a music selection tool — it's the full wedding music experience platform. Couples don't just paste URLs; they explore, discover, share, and print their wedding music program. The DJ doesn't just manage clients; they see real-time progress, get notified on updates, and export directly to Spotify for event prep.

---

## Architecture

### Stack
- **Framework:** Next.js 14+ (App Router)
- **Language:** TypeScript throughout
- **Styling:** Tailwind CSS (see [DESIGN.md](/DESIGN.md) for tokens)
- **Backend:** Supabase (existing project — Postgres, Auth, Realtime)
- **Hosting:** Vercel (replaces GitHub Pages + Netlify)

### Key Decisions (from reviews)
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Supabase project | Same (existing) | Zero data migration, clients keep working |
| Client auth model | Link-only (no login) | Conscious convenience tradeoff for <100 clients |
| Column rename | TypeScript alias only | Keep DB column `spotify_url`, alias to `mediaUrl` in TS types |
| Realtime conflicts | Last-write-wins + visual flash | Couples typically collaborate in person |
| PDF export | CSS @media print | Shareable page IS the PDF — no layout duplication |
| Responsive | Mobile-first from Phase 2 | Couples use phones; Tailwind default |
| Error handling | Visible failures with toast + retry | Silent data loss is the worst bug for weddings |
| Test strategy | Full pyramid (Vitest + RTL + Playwright) | Tests are the cheapest lake to boil |
| Shareable page caching | ISR with 60s revalidation | Prevents DB spam when link shared in group chats |

### System Architecture
```
                        ┌─────────────────────────────────────────────┐
                        │              VERCEL (Next.js 14)            │
                        │                                             │
  Browser ──────────►   │  PAGES (App Router):                       │
                        │    /                    Landing page        │
                        │    /selections?name=&date=  Client portal  │
                        │    /program/[key]       Shareable program   │
                        │    /admin               Dashboard           │
                        │                                             │
                        │  API ROUTES (server-only):                  │
                        │    /api/oembed-proxy    SoundCloud fix      │
                        │    /api/send-magic-link Admin action        │
                        └─────────────┬───────────────────────────────┘
                                      │
                        ┌─────────────▼───────────────────┐
                        │         SUPABASE                 │
                        │  Postgres (clients, selections)  │
                        │  Auth (email/pw + magic link)    │
                        │  Realtime (subscriptions)        │
                        │  RLS (anon: read/upsert,         │
                        │       auth: full CRUD)           │
                        └──────────────────────────────────┘
```

### File Structure
```
src/
  app/
    page.tsx                          # Landing page
    selections/page.tsx               # Client selection portal
    program/[clientKey]/page.tsx       # Shareable program (SSR for OG)
    admin/page.tsx                     # Admin dashboard
    api/
      oembed-proxy/route.ts           # SoundCloud CORS proxy
      send-magic-link/route.ts        # Service role key (server-only)
  components/
    selection-card.tsx                 # ★ Core reusable component
    program-brochure.tsx               # 3 modes: interactive/readonly/print
    embed-player.tsx                   # Platform-aware iframe renderer
    progress-ring.tsx                  # Completion indicator
    dark-mode-toggle.tsx               # Theme switcher
    toast.tsx                          # Error/success notifications
  lib/
    supabase/
      client.ts                        # Browser client (anon key)
      server.ts                        # Server client (service role)
    oembed.ts                          # Platform detect + metadata fetch
    client-key.ts                      # Key derivation (must match original)
    types.ts                           # DB schema types
  hooks/
    use-selections.ts                  # Load/save/subscribe to selections
    use-lock-status.ts                 # Check if client is locked
```

---

## Database Schema (Supabase — existing project)

### Table: `clients`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `name` | text | e.g. "Sierra & Thad" |
| `email` | text | Primary contact email |
| `wedding_date` | date | e.g. 2026-06-15 |
| `locked` | boolean | Default false. When true, client portal is read-only |
| `created_at` | timestamptz | Auto |

### Table: `wedding_selections`
| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `client_key` | text | Derived from name+date |
| `section_id` | text | e.g. "first-dance", "bride-walk" |
| `spotify_url` | text | Nullable. Song/playlist link (aliased as `mediaUrl` in TypeScript) |
| `song_title` | text | Nullable. Resolved song title |
| `artist` | text | Nullable. Resolved artist name |
| `notes` | text | Nullable. Client notes or announcement text |
| `updated_at` | timestamptz | Auto |

**Unique constraint:** `(client_key, section_id)` — upsert on conflict.

---

## Pages & Features

### 1. Client Portal — `/selections?name=&date=`
> **Jira:** CDP-2 through CDP-11

#### Information Hierarchy (Design Review)
```
┌─────────────────────────────────────────────────────┐
│  HEADER: Logo ─────────────────── Dark Mode Toggle  │
├─────────────────────────────────────────────────────┤
│  BROCHURE (PRIMARY FOCAL POINT)                     │
│  ├─ Couple names (Bodoni Moda, large)               │
│  ├─ "Wedding Music Program" + Date                  │
│  ├─ "Announcing as: ___"                            │
│  ├─ Program list (dot-leader: moment ... song)      │
│  └─ PROGRESS: ████████░░░░ 8/14 moments            │
│                                                      │
│  ── ANNOUNCEMENT (dark card) ──────────────────────  │
│                                                      │
│  ── Ceremony ── (category header, Bodoni italic)     │
│  Guest Seating · Wedding Party Walk · Bride Walk ·   │
│  The Kiss · Ceremony Exit                            │
│                                                      │
│  ── Reception ─────────────────────────────────────  │
│  ── Special Dances ────────────────────────────────  │
│  ── Additional ────────────────────────────────────  │
│  ── Custom Moments ── [+ Add Custom Moment] ───────  │
│  ── Sample Playlists (collapsed by default) ───────  │
│  ── Additional Notes ──────────────────────────────  │
└─────────────────────────────────────────────────────┘
```

#### Features
- **Selection cards** — reusable component for all 15 moments (song/playlist/text types)
- **Platform detection** — Spotify, YouTube, SoundCloud, unknown URL → appropriate embed
- **oEmbed proxy** — server-side proxy for SoundCloud CORS (`/api/oembed-proxy`)
- **Save/load** — Supabase SDK upsert with error handling (toast + retry on failure)
- **Tombstone deletion** — null `spotify_url` row hides section on reload
- **Custom moments** — dynamic sections with `__custom_def__` marker
- **Progress ring** — completion counter in brochure header, gold fill animation
- **Dark mode toggle** — warm dark palette, persisted in localStorage
- **Lock overlay** — full-screen "Your selections are finalized" when admin locks
- **Real-time subscriptions** — Supabase Realtime filtered by `client_key`, visual flash on partner's changes, reconnecting banner on disconnect
- **Completion celebration** — confetti + gold ring + "You're all set!" at 14/14
- **Embed micro-interactions** — 200ms fade-in on iframe load, fade-out on clear
- **Category headers** — Bodoni Moda italic dividers between section groups

#### Interaction States (Design Review)
| Feature | Loading | Empty | Error | Success |
|---------|---------|-------|-------|---------|
| Page load | Skeleton cards with shimmer | "Let's build your wedding soundtrack!" 0/14 | "Couldn't load. Try again?" [Retry] | Sections populated, ring fills |
| Song embed | Spinner + "Uploading..." | Input focused, placeholder | Toast: "Couldn't save. We'll retry." | "✓ Song Saved" pill, brochure updates |
| Realtime | — | — | "Reconnecting..." yellow banner | Flash highlight on changed section |

### 2. Shareable Program — `/program/[clientKey]`
> **Jira:** CDP-12

Read-only wedding program page. Feels like a printed wedding program, not a web app.
- SSR for dynamic OG meta tags (couple names, Chi Duly branding)
- ISR with 60s revalidation (caches page, refetches every 60s)
- Dot-leader pattern: `Bride Walk ........... Perfect - Ed Sheeran`
- "Download PDF" button (CSS @media print) + "Share Link" button
- Empty state: "No selections yet. When [names] make their selections, they'll appear here."
- Partial state: filled moments show songs, others show "Pending"

### 3. Admin Dashboard — `/admin`
> **Jira:** CDP-13 through CDP-18

- **Login** — Supabase email/password auth
- **Add Client** — name, date, email → inserts to `clients`
- **Client table** — name, date, email, status (Active/Locked), progress %, portal link, actions
- **Activity feed** — "Last activity: 2h ago" per client, click for detail log
- **Actions** — Send magic link (modal + additional recipients), edit email, lock/unlock, delete (two-step confirmation)
- Mobile: card layout per client (not squished table)

### 4. Landing Page — `/` (Optional, Phase 4)
> **Jira:** CDP-19

- Chi Duly branding, hero section, countdown timer, Fillout.com embed
- Lower priority — existing Fillout form works fine

---

## Implementation Phases

### PR1: Core Rebuild + Expansions
> **Jira:** CDP-1 (Epic)

#### Phase 1: Project Setup
| # | Task | Jira |
|---|------|------|
| 1 | Initialize Next.js + TypeScript + Tailwind, configure tailwind.config.ts with design tokens from DESIGN.md | CDP-2 |
| 2 | Set up Supabase clients (browser + server), env vars, TypeScript types with `mediaUrl` alias | CDP-2 |
| 3 | Configure Vercel deployment, preview deploys | CDP-2 |

#### Phase 2: Client Selection Page (mobile-first)
| # | Task | Jira |
|---|------|------|
| 4 | Build `program-brochure` component (3 modes: interactive/readonly/print), progress ring in header | CDP-3 |
| 5 | Build `selection-card` component (song/playlist/text types), section config data array (15 sections) | CDP-4 |
| 6 | Implement platform detection + `embed-player` component (Spotify, YouTube, SoundCloud, unknown) | CDP-5 |
| 7 | Build `/api/oembed-proxy` for SoundCloud CORS, oEmbed metadata fetching | CDP-5 |
| 8 | Implement `use-selections` hook — save/load/clear/delete with Supabase SDK, toast on error, retry | CDP-6 |
| 9 | Build announcement section (dark card), custom moments (add/remove), sample playlists (collapsed), additional notes | CDP-7 |
| 10 | Implement lock overlay, URL personalization (name/date params) | CDP-8 |
| 11 | Implement remove/undo section functionality, tombstone saves | CDP-8 |
| 12 | Dark mode toggle with warm dark palette, persisted in localStorage | CDP-9 |
| 13 | Supabase Realtime subscriptions — live partner updates, reconnecting banner, visual flash | CDP-10 |
| 14 | Completion celebration — confetti + gold ring at 14/14 | CDP-11 |
| 15 | Embed micro-interactions — fade-in/out on iframe load/clear | CDP-11 |
| 16 | Category headers with Bodoni Moda italic dividers | CDP-11 |
| 17 | Dynamic OG meta tags for selection page | CDP-11 |

#### Phase 3: Shareable Program + PDF
| # | Task | Jira |
|---|------|------|
| 18 | Build `/program/[clientKey]` page — SSR, ISR 60s, read-only brochure, OG meta | CDP-12 |
| 19 | CSS @media print styles — hide buttons, adjust margins, force light mode | CDP-12 |
| 20 | "Download PDF" button (triggers print dialog) + "Share Link" button (copy to clipboard) | CDP-12 |

#### Phase 4: Admin Dashboard
| # | Task | Jira |
|---|------|------|
| 21 | Build admin login screen with Supabase auth | CDP-13 |
| 22 | Build "Add New Client" form | CDP-14 |
| 23 | Build clients table (desktop: full table, mobile: card layout) with progress % column | CDP-15 |
| 24 | Implement activity feed — last updated timestamps, per-client activity log | CDP-16 |
| 25 | Send magic link modal (primary email + additional recipients) via `/api/send-magic-link` | CDP-17 |
| 26 | Inline email editing, lock/unlock toggle, copy link | CDP-17 |
| 27 | Delete with two-step confirmation (atomic: selections + client row) | CDP-18 |

#### Phase 5: Polish & Extras
| # | Task | Jira |
|---|------|------|
| 28 | Noise texture overlay (SVG feTurbulence filter) | CDP-11 |
| 29 | Fade-up entrance animations (staggered, respects prefers-reduced-motion) | CDP-11 |
| 30 | Landing page with Fillout embed (optional) | CDP-19 |

#### Phase 6: Testing
| # | Task | Jira |
|---|------|------|
| 31 | Unit tests — client key derivation, platform detection, oEmbed parsing, section config | CDP-20 |
| 32 | Component tests — selection card, brochure, progress ring, embed player, dark mode | CDP-20 |
| 33 | E2E tests — full selection flow, admin CRUD, shareable program, lock overlay | CDP-20 |

### PR2: Spotify Export + Email Notifications (follow-up)
> **Jira:** CDP-21, CDP-22

| # | Task | Jira |
|---|------|------|
| 34 | Spotify folder export — OAuth flow, playlist creation per moment | CDP-21 |
| 35 | Email notifications — Supabase webhook → Resend, debounced per client | CDP-22 |

### Post-Deploy
> **Jira:** CDP-23

| # | Task | Jira |
|---|------|------|
| 36 | Decommission original site — remove Netlify functions, edge functions, archive HTML | CDP-23 |

---

## Error Handling (Eng Review)

All save/load operations must have visible error handling:
1. **Save failure** → toast notification + automatic retry (3x with backoff) + "unsaved changes" indicator
2. **Load failure** → error state with [Retry] button, not blank page
3. **SoundCloud CORS** → proxy through `/api/oembed-proxy`
4. **Delete atomicity** → Supabase RPC or handle partial failure with rollback
5. **Magic link email** → "resend" button in admin (email delivery is fire-and-forget)

---

## Security Notes (CEO Review)

- **`SUPABASE_SERVICE_ROLE_KEY` must NEVER appear in client-side code or `NEXT_PUBLIC_*` env vars**
- Client portal is intentionally unauthenticated (link-based access) — conscious tradeoff
- RLS policies must scope anon writes to matching `client_key` only
- All user-submitted text rendered via React's default escaping (no `dangerouslySetInnerHTML`)
- Only known platforms (Spotify/YouTube/SoundCloud) get iframe `src` attributes

---

## Key Behavioral Notes

- **Client key derivation** must exactly match original: `(name + '-' + date).toLowerCase().replace(/[^a-z0-9-]/g, '-')`
- **Upsert pattern:** `ON CONFLICT (client_key, section_id)` merge-duplicates
- **Tombstone rows:** null `spotify_url` = section was deleted
- **Custom moment marker:** `song_title: '__custom_def__'`, label in `notes`
- **Notes as separate rows:** `{sectionId}-notes` section_id convention
- **Deduplication on load:** keep latest by `updated_at` (handles legacy dupes)

---

## Design System

See [DESIGN.md](/DESIGN.md) for complete design system including:
- Color tokens (light mode, dark mode, admin, landing)
- Typography scale (Bodoni Moda + Raleway)
- Spacing scale (4px grid)
- Animation timing
- Component patterns
- Accessibility requirements (WCAG AA, 44px touch targets, keyboard nav, screen readers)
- Responsive strategy (mobile-first, breakpoints at 640/768/1024px)

---

## Jira Tickets

### Epic: CDP-1 — Wedding DJ Portal Rebuild

| Ticket | Title | Phase | Effort | Dependencies |
|--------|-------|-------|--------|--------------|
| CDP-2 | Project Setup: Next.js + Supabase + Vercel | 1 | S | — |
| CDP-3 | Brochure Component + Progress Ring | 2 | M | CDP-2 |
| CDP-4 | Selection Card Component (reusable, 3 types) | 2 | M | CDP-2 |
| CDP-5 | Platform Detection + Embed Player + oEmbed Proxy | 2 | M | CDP-2 |
| CDP-6 | Save/Load/Delete Hook + Error Handling (toast + retry) | 2 | M | CDP-2 |
| CDP-7 | Announcement, Custom Moments, Sample Playlists, Notes | 2 | M | CDP-4, CDP-6 |
| CDP-8 | Lock Overlay, URL Personalization, Remove/Undo Sections | 2 | S | CDP-6 |
| CDP-9 | Dark Mode Toggle (warm dark palette) | 2 | S | CDP-2 |
| CDP-10 | Supabase Realtime Subscriptions (live partner updates) | 2 | M | CDP-6 |
| CDP-11 | Polish: Celebration, Micro-interactions, Animations, OG Meta | 5 | M | CDP-3, CDP-4 |
| CDP-12 | Shareable Program Page + PDF Export | 3 | M | CDP-3 |
| CDP-13 | Admin: Login Screen (Supabase auth) | 4 | S | CDP-2 |
| CDP-14 | Admin: Add New Client Form | 4 | S | CDP-13 |
| CDP-15 | Admin: Client Table + Progress % + Mobile Card Layout | 4 | M | CDP-13 |
| CDP-16 | Admin: Activity Feed (last updated, per-client log) | 4 | M | CDP-15 |
| CDP-17 | Admin: Send Magic Link, Edit Email, Lock/Unlock, Copy Link | 4 | M | CDP-15 |
| CDP-18 | Admin: Delete Client (two-step, atomic) | 4 | S | CDP-15 |
| CDP-19 | Landing Page (Fillout embed, optional) | 5 | S | CDP-2 |
| CDP-20 | Full Test Suite (unit + component + E2E) | 6 | L | CDP-7, CDP-17 |
| CDP-21 | Spotify Folder Export (PR2: OAuth + playlist creation) | PR2 | L | CDP-20 |
| CDP-22 | Email Notifications (PR2: Supabase webhook → Resend) | PR2 | M | CDP-20 |
| CDP-23 | Post-Deploy: Decommission Original Site | Post | S | CDP-20 |

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://lfnlftxqdelcrmbceiob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # ⚠️ SERVER-ONLY, never NEXT_PUBLIC_

# Spotify (PR2 only)
SPOTIFY_CLIENT_ID=<client id>
SPOTIFY_CLIENT_SECRET=<client secret>

# Email (PR2 only)
RESEND_API_KEY=<api key>
```

---

## Review History

| Review | Date | Status | Score | Key Decisions |
|--------|------|--------|-------|---------------|
| CEO Review | 2026-03-20 | CLEAR | — | 10 expansions accepted, Approach A (Next.js), same Supabase project |
| Eng Review | 2026-03-20 | CLEAR | — | PR split (core + expansions / Spotify + email), full test pyramid, ISR caching |
| Design Review | 2026-03-20 | CLEAR | 8/10 | DESIGN.md created, interaction states specified, completion celebration, CSS print PDF |
