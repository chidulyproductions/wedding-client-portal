# CDP-12: Shareable Program Page + PDF Export

**Type:** Task
**Priority:** P1
**Phase:** 3 — Shareable Program + PDF
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-3](CDP-3.md)
**Plan ref:** [Phase 3, tasks 18-20](../plans/wedding-portal-rebuild.md#phase-3-shareable-program--pdf)

## Summary
Build the shareable read-only wedding program page at `/program/[clientKey]` with SSR, ISR caching, dynamic OG meta tags, and CSS-based PDF export.

## Acceptance Criteria
- [ ] `/program/[clientKey]` renders read-only brochure (uses `program-brochure` in `readonly` mode)
- [ ] SSR with dynamic OG meta tags: couple names, "Wedding Music Program", Chi Duly branding
- [ ] ISR with 60s revalidation (serves cached page, refetches every 60s in background)
- [ ] Dot-leader pattern: `Bride Walk ........... Perfect - Ed Sheeran`
- [ ] **Empty state**: "No selections yet. When [names] make their selections, they'll appear here."
- [ ] **Partial state**: filled moments show songs, unfilled show "Pending"
- [ ] "Download PDF" button triggers browser print dialog
- [ ] CSS `@media print` styles: hide buttons, adjust margins, force light mode, clean layout
- [ ] "Share Link" button copies page URL to clipboard with toast confirmation
- [ ] Page feels like a printed wedding program, not a web app
- [ ] Mobile-first responsive (full-width mobile, max-width 600px desktop)

## Technical Notes
- Reuses `program-brochure` component from CDP-3 (in `readonly` and `print` modes)
- CSS @media print avoids duplicating layout with @react-pdf/renderer
- ISR prevents DB spam when link shared in group chats
- See [Shareable Program](../plans/wedding-portal-rebuild.md#2-shareable-program--programclientkey)
