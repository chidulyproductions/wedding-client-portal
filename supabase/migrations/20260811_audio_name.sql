-- Names the cut, not just the song: the player label reads
-- "<song_title> — <audio_name>", e.g. "Young & Beautiful — Quick Hitter".
-- Prefilled from the uploaded filename and editable in place, because
-- deriving it automatically was unusable on half of the real edits
-- (typos carried through, generic "Wedding Edit", the couple's own names).
alter table wedding_selections add column if not exists audio_name text;

comment on column wedding_selections.audio_name is
  'Human-readable name of the uploaded cut (e.g. "Quick Hitter"). Paired with audio_url; cleared whenever audio_url is.';
