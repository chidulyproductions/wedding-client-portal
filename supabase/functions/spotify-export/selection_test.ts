import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectExportSections, type SelectionRow } from "./selection.ts";

// A realistic Sierra & Thad-style dataset: a mix of filled template moments,
// tombstoned (deleted) template moments, a special non-template section, a
// custom moment, and non-exportable rows (playlist embeds, announcement, notes).
function sierraThadRows(): SelectionRow[] {
  return [
    // filled template moments
    { section_id: "first-dance", spotify_url: "https://open.spotify.com/track/39X2xdmnX3UAWNmyhKdVtc", song_title: "Dive", artist: "Olivia Dean", notes: null },
    { section_id: "the-kiss", spotify_url: "https://open.spotify.com/track/5LYMamLv12UPbemOaTPyeV", song_title: "Music For a Sushi Restaurant", artist: "Harry Styles", notes: null },
    // tombstoned/deleted template moments — null url, must NOT export
    { section_id: "ceremony-exit", spotify_url: null, song_title: null, artist: null, notes: null },
    { section_id: "bouquet-toss", spotify_url: null, song_title: null, artist: null, notes: null },
    // special, non-template hardcoded section (per-client special add) — must export
    { section_id: "second-look-entrance", spotify_url: "https://open.spotify.com/track/0ccoGCaOFCxI6pHixrQpKj", song_title: "Neverender", artist: "Justice, Tame Impala", notes: null },
    // custom moment: definition row (label only) + the actual song row
    { section_id: "custom-def-1700000000", spotify_url: null, song_title: "__custom_def__", artist: null, notes: "Concessional" },
    { section_id: "custom-1700000000", spotify_url: "https://open.spotify.com/track/4lcnmk02v9b4i9ICtFupEV", song_title: "Don't Stop Me Now", artist: "Queen", notes: null },
    // non-exportable rows
    { section_id: "cocktail-hour", spotify_url: "https://open.spotify.com/playlist/0PUGi9sgLFpy3ayPJS4unM", song_title: "Cocktail", artist: null, notes: null },
    { section_id: "announcement", spotify_url: null, song_title: "Mr and Mrs Sauter", artist: null, notes: null },
    { section_id: "first-dance-notes", spotify_url: null, song_title: null, artist: null, notes: "start at 0:30" },
    // title present but url null (manual entry where embed failed) — brochure hides it, so must NOT export
    { section_id: "cake-cutting", spotify_url: null, song_title: "Some Song", artist: "Someone", notes: null },
  ];
}

Deno.test("excludes tombstoned/deleted template sections (ceremony-exit, bouquet-toss)", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids.includes("ceremony-exit"), false);
  assertEquals(ids.includes("bouquet-toss"), false);
});

Deno.test("excludes playlist embeds, announcement, and -notes rows", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids.includes("cocktail-hour"), false);
  assertEquals(ids.includes("announcement"), false);
  assertEquals(ids.includes("first-dance-notes"), false);
});

Deno.test("excludes rows that have a title but null url (brochure hides these)", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids.includes("cake-cutting"), false);
});

Deno.test("includes special non-template section with a human label", () => {
  const out = selectExportSections(sierraThadRows());
  const sl = out.find((s) => s.section_id === "second-look-entrance");
  assertEquals(sl?.label, "Second Look Entrance");
});

Deno.test("includes custom moment song with label from its custom-def row, and excludes the def row itself", () => {
  const out = selectExportSections(sierraThadRows());
  const ids = out.map((s) => s.section_id);
  assertEquals(ids.includes("custom-def-1700000000"), false);
  const custom = out.find((s) => s.section_id === "custom-1700000000");
  assertEquals(custom?.label, "Concessional");
});

Deno.test("exports only the real program moments, in chronological order", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  // the-kiss (order 3) < first-dance (order 7) < non-template specials last
  assertEquals(ids, [
    "the-kiss",
    "first-dance",
    "second-look-entrance",
    "custom-1700000000",
  ]);
});
