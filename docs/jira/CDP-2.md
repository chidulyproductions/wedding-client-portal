# CDP-2: Project Setup: Next.js + Supabase + Vercel

**Type:** Task
**Priority:** P1
**Phase:** 1 — Project Setup
**Effort:** S
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** None
**Plan ref:** [Phase 1, tasks 1-3](../plans/wedding-portal-rebuild.md#phase-1-project-setup)

## Summary
Initialize the Next.js 14 project with TypeScript, Tailwind CSS, and Supabase integration. Configure design tokens from DESIGN.md and set up Vercel deployment.

## Acceptance Criteria
- [ ] Next.js 14+ App Router project initialized with TypeScript
- [ ] Tailwind CSS configured with design tokens from DESIGN.md (colors, typography, spacing)
- [ ] Supabase browser client (`src/lib/supabase/client.ts`) using `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] Supabase server client (`src/lib/supabase/server.ts`) using `SUPABASE_SERVICE_ROLE_KEY`
- [ ] TypeScript types for DB schema (`src/lib/types.ts`) with `mediaUrl` alias for `spotify_url` column
- [ ] Client key derivation function (`src/lib/client-key.ts`) matching original regex exactly
- [ ] `.env.example` with all required env vars documented
- [ ] Vercel project connected, preview deploys working
- [ ] Google Fonts loaded: Bodoni Moda + Raleway
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is NOT in any `NEXT_PUBLIC_*` variable

## Technical Notes
- Client key derivation: `(name + '-' + date).toLowerCase().replace(/[^a-z0-9-]/g, '-')`
- TypeScript alias: DB column stays `spotify_url`, TS type maps it to `mediaUrl`
- See [Architecture](../plans/wedding-portal-rebuild.md#architecture) and [File Structure](../plans/wedding-portal-rebuild.md#file-structure)
