# CDP-3: Brochure Component + Progress Ring

**Type:** Task
**Priority:** P1
**Phase:** 2 — Client Selection Page
**Effort:** M
**Epic:** [CDP-1](CDP-1.md)
**Dependencies:** [CDP-2](CDP-2.md)
**Plan ref:** [Phase 2, task 4](../plans/wedding-portal-rebuild.md#phase-2-client-selection-page-mobile-first)

## Summary
Build the `program-brochure` component with 3 render modes (interactive, readonly, print) and a progress ring showing completion count.

## Acceptance Criteria
- [ ] `program-brochure.tsx` supports 3 modes via prop: `interactive` (client portal), `readonly` (shareable page), `print` (PDF)
- [ ] Couple names displayed in Bodoni Moda italic (Display type)
- [ ] "Wedding Music Program" subtitle + wedding date
- [ ] "Announcing as: ___" line updates from announcement section
- [ ] Dot-leader pattern for program list: `Bride Walk ........... Perfect - Ed Sheeran`
- [ ] "Make Selection" links for unfilled moments, scrolling to corresponding section card
- [ ] Progress ring in brochure header showing `X/14 moments` with gold fill animation (500ms ease-out)
- [ ] Progress ring updates live as selections are saved
- [ ] Mobile-first responsive layout (full-width mobile, max-width 600px desktop)
- [ ] Reduced motion: ring fills instantly when `prefers-reduced-motion` is set

## Design Tokens
- Couple names: Bodoni Moda, 2.5rem, 700 weight, italic
- Section titles: Raleway, 0.85rem, 600 weight, uppercase, 0.2em tracking
- Card padding: 16px (base), max-width 600px centered
- Progress ring animation: 500ms ease-out gold fill
- See [DESIGN.md](/DESIGN.md)
