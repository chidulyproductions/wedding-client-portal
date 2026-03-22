# CDP-1: Wedding DJ Portal Rebuild (Epic)

**Type:** Epic
**Priority:** P1
**Plan:** [wedding-portal-rebuild.md](../plans/wedding-portal-rebuild.md)

## Summary
Full rebuild of the Chi Duly Productions wedding DJ client portal from static HTML/JS (3,632 lines across 3 files) into a modern Next.js 14 application with expanded features.

## Scope
- PR1: Core rebuild + 8 scope expansions (CDP-2 through CDP-20)
- PR2: Spotify export + email notifications (CDP-21, CDP-22)
- Post-deploy: Decommission original site (CDP-23)

## Child Tickets
| Ticket | Title | Phase | Effort |
|--------|-------|-------|--------|
| CDP-2 | Project Setup | 1 | S |
| CDP-3 | Brochure Component + Progress Ring | 2 | M |
| CDP-4 | Selection Card Component | 2 | M |
| CDP-5 | Platform Detection + Embed Player + oEmbed Proxy | 2 | M |
| CDP-6 | Save/Load/Delete Hook + Error Handling | 2 | M |
| CDP-7 | Announcement, Custom Moments, Sample Playlists, Notes | 2 | M |
| CDP-8 | Lock Overlay, URL Personalization, Remove/Undo | 2 | S |
| CDP-9 | Dark Mode Toggle | 2 | S |
| CDP-10 | Supabase Realtime Subscriptions | 2 | M |
| CDP-11 | Polish: Celebration, Micro-interactions, Animations | 5 | M |
| CDP-12 | Shareable Program Page + PDF Export | 3 | M |
| CDP-13 | Admin: Login Screen | 4 | S |
| CDP-14 | Admin: Add New Client Form | 4 | S |
| CDP-15 | Admin: Client Table + Progress % | 4 | M |
| CDP-16 | Admin: Activity Feed | 4 | M |
| CDP-17 | Admin: Send Magic Link, Edit Email, Lock/Unlock | 4 | M |
| CDP-18 | Admin: Delete Client (two-step, atomic) | 4 | S |
| CDP-19 | Landing Page (optional) | 5 | S |
| CDP-20 | Full Test Suite | 6 | L |
| CDP-21 | Spotify Folder Export (PR2) | PR2 | L |
| CDP-22 | Email Notifications (PR2) | PR2 | M |
| CDP-23 | Decommission Original Site | Post | S |

## Done When
- All PR1 tickets (CDP-2 through CDP-20) are complete and deployed to Vercel
- At least 2 real clients validated on the new portal
