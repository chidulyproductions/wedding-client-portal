-- Custom moments could only ever land in a trailing "custom" bucket — last in
-- the form list, and in their own brochure group after ceremony/reception/late
-- night. Some of them are not miscellaneous at all: Kenzie & Levi's "Chad the
-- Beer Guy's Walk Down" belongs in the ceremony processional, and Brian &
-- Stephanie's "Parents Dance" is a reception moment.
--
-- anchor_before names the section_id a custom moment renders immediately
-- before. It is only meaningful on custom-def rows. Null keeps the old
-- behaviour, so every existing row is unaffected.
alter table public.wedding_selections
  add column if not exists anchor_before text;

comment on column public.wedding_selections.anchor_before is
  'custom-def rows only: section_id this custom moment renders immediately before, on both the form and the brochure. Null = falls in the trailing custom-moments bucket.';
