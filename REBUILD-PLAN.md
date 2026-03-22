# Chi Duly Productions — Wedding DJ Portal Rebuild Plan

## Project Overview

A custom wedding DJ client portal for **Chi Duly Productions**. Clients receive a personalized link to select music for every moment of their wedding day. The DJ (you) manages clients from an admin dashboard.

**Live reference (original):** The original is a static HTML/JS site hosted on GitHub Pages with Supabase backend and Netlify serverless functions.

---

## Architecture

### Current Stack (Original)
- **Frontend:** 3 static HTML files (no framework, inline CSS/JS)
- **Backend:** Supabase (Postgres DB + Auth + Edge Functions)
- **Serverless:** Netlify Functions (Spotify API proxy, save/load selections)
- **Hosting:** GitHub Pages (static) + Netlify (functions)
- **External:** Spotify oEmbed, YouTube oEmbed, SoundCloud oEmbed, Fillout.com (intake form)

### Recommended Stack (Rebuild)
- **Framework:** Next.js 14+ (App Router) — gives you SSR, API routes, and proper component architecture
- **Styling:** Tailwind CSS — fast iteration, design tokens for the brand
- **Backend:** Supabase (same project or new) — Postgres, Auth, Edge Functions
- **Hosting:** Vercel (natural fit for Next.js, replaces both GitHub Pages and Netlify)
- **Language:** TypeScript throughout

> **Alternative:** If you want to keep it simple and close to the original, you could rebuild with **Vite + React + TypeScript** as a pure SPA. The original had no SSR needs.

---

## Database Schema (Supabase)

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
| `client_key` | text | Derived from name+date, e.g. "sierra---thad-2026-06-15" |
| `section_id` | text | e.g. "first-dance", "bride-walk", "custom-1234" |
| `spotify_url` | text | Nullable. The song/playlist link (Spotify, YouTube, SoundCloud, or any URL) |
| `song_title` | text | Nullable. Resolved song title |
| `artist` | text | Nullable. Resolved artist name |
| `notes` | text | Nullable. Client notes or announcement text |
| `updated_at` | timestamptz | Auto |

**Unique constraint:** `(client_key, section_id)` — upsert on conflict.

### Auth
- Admin login via Supabase email/password auth
- Client access is unauthenticated (link-based with URL params) OR via Supabase magic link OTP

---

## Pages & Routes

### 1. Client Portal — Music Selection Page
**Route:** `/selections?name=Sierra+%26+Thad&date=2026-06-15`

This is the main client-facing page. It has two major sections:

#### A. Wedding Music Program (read-only brochure view at top)
A beautiful, centered "wedding program" card that shows every moment and the song chosen for it. Updates live as the client makes selections below. Organized by category:

- **Ceremony:** Guest Seating, Wedding Party Walk, Bride Walk, The Kiss, Ceremony Exit
- **Reception:** Wedding Party Entrance, Grand Entrance
- **Special Dances:** First Dance, Father/Daughter, Mother/Son, Anniversary Dance
- **Last Song:** Last Song of the Night
- **Additional:** Cake Cutting, Bouquet Toss, Dance Floor Must Plays, Last Dance (Private)
- **Custom Moments:** Dynamically added by client

Each moment shows "Make Selection" as a clickable link that scrolls to the corresponding section below, or shows the song title once selected.

The program header shows:
- Couple's names (from URL `name` param)
- "Wedding Music Program" title
- Wedding date (from URL `date` param)
- "Announcing as: ..." line (from the announcement section)

#### B. Selection Sections (interactive forms below)
Each wedding moment gets its own card with:
- **Section header:** Label (e.g. "FIRST DANCE"), type badge ("Song Link" or "Playlist Link")
- **Input row:** Text input + "Upload" button
- **Embed area:** Shows Spotify/YouTube/SoundCloud embedded player after upload
- **Manual title entry:** For non-supported platforms, shows a text input for song name
- **Notes textarea:** (for playlist sections: Guest Seating, Cocktail Hour, Dinner Hour, Dance Floor Must Plays)
- **Saved pill:** "✓ Song Saved" indicator
- **Clear button:** Removes selection
- **Remove button (🗑):** Hides the entire section with undo capability

**Section types:**
| Type | Sections | Input |
|---|---|---|
| Song Link | Bride Walk, The Kiss, Ceremony Exit, Wedding Party Walk, Party Entrance, Grand Entrance, First Dance, Father/Daughter, Mother/Son, Anniversary Dance, Last Song, Cake Cutting, Bouquet Toss, Last Dance (Private) | Single song link |
| Playlist Link | Guest Seating, Cocktail Hour, Dinner Hour, Dance Floor Must Plays | Playlist link + notes textarea |
| Text Input | Grand Entrance Announcement | Textarea for how they want to be announced |

**Special sections:**
- **Grand Entrance Announcement:** Dark card at the top. Textarea for "How would you like to be announced?" Saves to the program brochure "Announcing as" line.
- **Custom Moments:** Client can add their own moments via "+ Add Custom Moment" button at the bottom. Each gets a name input, then creates a new Song Link section dynamically.
- **Sample Playlists:** A grid of Spotify embedded playlists curated by Chi Duly for inspiration (Guest Seating, Bride Walk, The Kiss, Cocktails/Dinner, Parent Dances, First Dance, Cake Cutting, Bouquet Toss). These are read-only, not saveable.
- **Additional Notes:** A final textarea for any extra notes.

#### C. Lock Overlay
If the admin has locked this client's selections, show a full-screen overlay: "Your selections are finalized." with contact info.

#### Platform Detection & Embedding Logic
The upload button detects the platform from the URL:
1. **Spotify** → Extract track/playlist/album ID → Spotify embed iframe (playlist height: 380px, track: 152px) → Fetch title/artist via Spotify oEmbed API
2. **YouTube** → Extract video ID → YouTube embed iframe → Fetch title via YouTube oEmbed API
3. **SoundCloud** → Fetch oEmbed HTML from SoundCloud API → Render their embed widget → Get title from oEmbed
4. **Unknown URL** → Save URL, show manual title input field so client can type song name

#### Data Flow
- On upload: Save to Supabase immediately via direct client SDK (upsert on `client_key` + `section_id`)
- On page load: Fetch all selections for this `client_key`, restore embeds and titles
- `client_key` derivation: `(name + '-' + date).toLowerCase().replace(/[^a-z0-9-]/g, '-')`
- Deleted sections saved as tombstone rows (null spotify_url) so they stay hidden on refresh
- Custom moment definitions saved with `song_title: '__custom_def__'` marker and label in `notes`

### 2. Admin Dashboard
**Route:** `/admin`

#### Login Screen
- Email + password fields
- Supabase email/password auth
- On success, show dashboard

#### Dashboard (authenticated)
Top bar: "Chi Duly Productions — Admin" + Sign Out button

**Add New Client form:**
- Client Name(s) — text input (e.g. "Sierra & Thad")
- Wedding Date — date picker
- Client Email — email input
- "Create Client" button → inserts into `clients` table

**All Clients table:**
| Column | Content |
|---|---|
| Client | Name (styled in italic serif) |
| Wedding Date | Formatted date |
| Email | Email + inline edit form |
| Status | "Active" (green badge) or "Locked" (pink badge) |
| Portal Link | "View Page ↗" link + "Copy Link" button |
| Actions | Send Link, Edit Email, Lock/Unlock, Delete |

**Actions:**
- **Send Link:** Opens modal with primary email (readonly) + additional recipients field (comma-separated). Sends Supabase magic link OTP to all addresses with redirect to the client's selection page.
- **Edit Email:** Inline edit form that updates the `clients` table.
- **Lock/Unlock:** Toggles `locked` boolean. When locked, the client sees the lock overlay.
- **Delete:** Two-step confirmation. Deletes all `wedding_selections` rows for that client's key, then deletes the `clients` row.

**Portal link format:** `{BASE_URL}/selections?name={encoded_name}&date={date}`

### 3. Landing/Index Page (Optional)
**Route:** `/`

The original had a landing page with:
- Chi Duly Productions branding
- Hero section: "Let's Build Your Sound"
- Wedding countdown timer (from URL `date` param)
- 4-step process indicator: Complete Form → We Review → Confirm Playlist → Enjoy Your Day
- Embedded Fillout.com intake form
- Personalized with URL `name` and `date` params

> This page used a Fillout.com embedded form. If you want to rebuild it, you could replace Fillout with a custom form or keep the embed.

---

## Design System

### Color Tokens

**Client Portal (Selections page) — Light/warm theme:**
```
--background: #f5f0ea (warm cream)
--card: #faf6f1 (off-white)
--text: #1a1218 (near-black warm)
--accent: #a07840 (gold/bronze)
--blush: #b06878 (rose/mauve — used for highlights, song titles)
--gray: #7a7275 (muted text)
--border: #ddd8d2 (light border)
--green: same as accent (gold)
```

**Admin Dashboard — Dark theme:**
```
--bg: #0e0c0f (deep purple-black)
--card: #1a1720 (dark card)
--border: #2e2a35 (subtle purple border)
--text: #f0ecf5 (light lavender white)
--muted: #7a7385 (gray-purple)
--accent: #a07840 (gold — matches client portal)
--blush: #b06878 (rose — matches client portal)
--green: #4caf7d (success green)
```

**Landing Page — Dark theme:**
```
--black: #0a0a0a
--white: #f5f5f0
--accent: #e8ff00 (neon yellow-green)
--mid: #1a1a1a
--gray: #888
```

### Typography
- **Display/Headings:** Bodoni Moda (serif, italic for emphasis)
- **Body:** Raleway (sans-serif, weights 200-800)
- **Landing page uses:** Bebas Neue (display) + DM Sans (body) — different vibe

### Visual Details
- Subtle noise/grain texture overlay on body (`feTurbulence` SVG filter)
- Fade-up entrance animations on page load (staggered)
- Cards have top accent border (3px colored line)
- Section numbers are pill badges with colored backgrounds
- Smooth scroll behavior

---

## API Routes / Serverless Functions

### 1. Spotify Metadata Proxy (if needed)
The original used a Netlify function to proxy Spotify API calls (client credentials flow) to get track/playlist metadata. However, the rebuild uses **oEmbed APIs** directly from the client (Spotify, YouTube, SoundCloud all have public oEmbed endpoints), so this may not be needed unless you want richer metadata.

### 2. Save Selection
**Endpoint:** Supabase Edge Function or Next.js API route
- POST: Upsert a row in `wedding_selections`
- Handles: normal saves, deleted tombstones, custom moment definitions
- Fields: `clientKey`, `sectionId`, `spotifyUrl`, `songTitle`, `artist`, `notes`, `deleted`, `customDef`

### 3. Load Selections
**Endpoint:** Supabase Edge Function or Next.js API route
- GET: Fetch all `wedding_selections` rows for a given `clientKey`
- Returns array ordered by `updated_at`

> **Note:** The original used both Supabase Edge Functions (Deno) AND Netlify Functions (Node.js) for the same endpoints. The rebuild should consolidate — either use Supabase Edge Functions or Next.js API routes, not both.

---

## Implementation Steps

### Phase 1: Project Setup
1. Initialize Next.js project with TypeScript and Tailwind
2. Set up Supabase client (env vars for URL, anon key, service role key)
3. Configure Vercel deployment
4. Set up the database tables (or connect to existing Supabase project)

### Phase 2: Client Selection Page
5. Build the Wedding Program brochure component (top section)
6. Build the selection section card component (reusable for all moments)
7. Implement platform detection + embedding logic (Spotify, YouTube, SoundCloud, unknown)
8. Implement oEmbed fetching for song metadata
9. Implement save/load/clear/delete selection logic against Supabase
10. Build the announcement section (dark card, textarea)
11. Build custom moments (add/remove dynamic sections)
12. Build the sample playlists grid
13. Build the additional notes section
14. Implement the lock overlay
15. Implement URL personalization (`name`, `date` params)
16. Add remove/undo section functionality

### Phase 3: Admin Dashboard
17. Build admin login screen with Supabase auth
18. Build the "Add New Client" form
19. Build the clients table with all columns
20. Implement Send Link modal (magic link OTP via Supabase)
21. Implement inline email editing
22. Implement lock/unlock toggle
23. Implement delete with two-step confirmation
24. Implement copy link functionality

### Phase 4: Polish & Extras
25. Responsive design (mobile-friendly for both pages)
26. Fade-up animations and transitions
27. Noise texture overlay
28. Landing page (optional — with intake form embed or custom form)

### Phase 5: Unfulfilled TODOs from Original
These were noted in the original project but not yet implemented:
29. **Email notifications:** Notify the DJ when a client updates/saves a selection
30. **Spotify export:** Export the wedding program to a Spotify folder with each song in its own playlist labeled with the corresponding moment

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://lfnlftxqdelcrmbceiob.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

# Spotify (only if using the metadata proxy)
SPOTIFY_CLIENT_ID=<client id>
SPOTIFY_CLIENT_SECRET=<client secret>
```

---

## Key Behavioral Notes

- **Client key derivation** is critical — it's how selections map to clients: `(name + '-' + date).toLowerCase().replace(/[^a-z0-9-]/g, '-')`
- **Upsert pattern:** All saves use `ON CONFLICT (client_key, section_id)` merge-duplicates
- **Tombstone rows:** When a client removes a section, a row with null `spotify_url` is saved so the section stays hidden on reload
- **Custom moment marker:** Custom moment definitions use `song_title: '__custom_def__'` with the label stored in `notes`
- **Notes are saved separately** with section_id `{sectionId}-notes` (separate row from the song selection)
- **Deduplication on load:** If multiple rows exist for the same section (legacy bug), keep only the latest by `updated_at`
- **The program brochure updates in real-time** as the user makes selections below — it's not a separate data source, it reads from the same selection state

---

## File Reference (Original)

For reference, the original source files are at:
```
Wedding Music Site/
├── index.html              — Landing page (Fillout form embed)
├── admin.html              — Admin dashboard (login + client management)
├── spotify-selections.html — Client music selection portal (main page)
├── chi-duly-logo.svg       — Logo (SVG)
├── logo2.png               — Logo (PNG, used for OG image)
├── netlify/functions/
│   ├── spotify.js          — Spotify API proxy (client credentials → track/playlist info)
│   ├── save-selection.js   — Save selection to Supabase via REST
│   └── load-selections.js  — Load selections from Supabase via REST
└── (supabase edge functions at repo root)
    └── supabase/functions/
        ├── save-selection/index.ts  — Deno edge function for saving
        └── load-selections/index.ts — Deno edge function for loading
```
