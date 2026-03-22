# Jira Tickets — Chi Duly Productions Wedding Portal (CDP)

**Epic:** [CDP-1](CDP-1.md) — Wedding DJ Portal Rebuild
**Plan:** [wedding-portal-rebuild.md](../plans/wedding-portal-rebuild.md)

## PR1: Core Rebuild + Expansions

### Phase 1: Project Setup
| Ticket | Title | Effort |
|--------|-------|--------|
| [CDP-2](CDP-2.md) | Project Setup: Next.js + Supabase + Vercel | S |

### Phase 2: Client Selection Page
| Ticket | Title | Effort |
|--------|-------|--------|
| [CDP-3](CDP-3.md) | Brochure Component + Progress Ring | M |
| [CDP-4](CDP-4.md) | Selection Card Component (reusable, 3 types) | M |
| [CDP-5](CDP-5.md) | Platform Detection + Embed Player + oEmbed Proxy | M |
| [CDP-6](CDP-6.md) | Save/Load/Delete Hook + Error Handling | M |
| [CDP-7](CDP-7.md) | Announcement, Custom Moments, Sample Playlists, Notes | M |
| [CDP-8](CDP-8.md) | Lock Overlay, URL Personalization, Remove/Undo | S |
| [CDP-9](CDP-9.md) | Dark Mode Toggle | S |
| [CDP-10](CDP-10.md) | Supabase Realtime Subscriptions | M |

### Phase 3: Shareable Program + PDF
| Ticket | Title | Effort |
|--------|-------|--------|
| [CDP-12](CDP-12.md) | Shareable Program Page + PDF Export | M |

### Phase 4: Admin Dashboard
| Ticket | Title | Effort |
|--------|-------|--------|
| [CDP-13](CDP-13.md) | Admin: Login Screen | S |
| [CDP-14](CDP-14.md) | Admin: Add New Client Form | S |
| [CDP-15](CDP-15.md) | Admin: Client Table + Progress % | M |
| [CDP-16](CDP-16.md) | Admin: Activity Feed | M |
| [CDP-17](CDP-17.md) | Admin: Send Magic Link, Edit Email, Lock/Unlock | M |
| [CDP-18](CDP-18.md) | Admin: Delete Client (two-step, atomic) | S |

### Phase 5: Polish & Extras
| Ticket | Title | Effort |
|--------|-------|--------|
| [CDP-11](CDP-11.md) | Polish: Celebration, Micro-interactions, Animations | M |
| [CDP-19](CDP-19.md) | Landing Page (optional) | S |

### Phase 6: Testing
| Ticket | Title | Effort |
|--------|-------|--------|
| [CDP-20](CDP-20.md) | Full Test Suite (unit + component + E2E) | L |

## PR2: Follow-up
| Ticket | Title | Effort | Blocked By |
|--------|-------|--------|------------|
| [CDP-21](CDP-21.md) | Spotify Folder Export | L | Spotify app approval |
| [CDP-22](CDP-22.md) | Email Notifications | M | Resend account setup |

## Post-Deploy
| Ticket | Title | Effort | Blocked By |
|--------|-------|--------|------------|
| [CDP-23](CDP-23.md) | Decommission Original Site | S | PR1 deployed + validated |
