import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { selectExportSections, extractSpotifyPlaylistId, extractTrackUrisFromEmbedHtml, type SelectionRow } from "./selection.ts";

// Minimal stand-in for Spotify's /embed/playlist/{id} page: a __NEXT_DATA__ blob
// whose entity carries a `trackList`. Mirrors the real shape (each entry has a
// `uri`), plus a duplicate and a non-track uri to exercise dedupe + filtering.
function embedHtmlFixture(): string {
  const next = {
    props: { pageProps: { state: { data: { entity: { trackList: [
      { uri: "spotify:track:AAA", title: "Song A", subtitle: "Artist A" },
      { uri: "spotify:track:BBB", title: "Song B", subtitle: "Artist B" },
      { uri: "spotify:track:AAA", title: "Song A", subtitle: "Artist A" }, // dup → dropped
      { uri: "spotify:episode:ZZZ", title: "A podcast", subtitle: "Not a track" }, // non-track → dropped
      { uri: "spotify:track:CCC", title: "Song C", subtitle: "Artist C" },
    ] } } } } },
  };
  return `<html><body><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(next)}</script></body></html>`;
}

Deno.test("extractTrackUrisFromEmbedHtml pulls ordered, de-duped spotify:track URIs", () => {
  assertEquals(extractTrackUrisFromEmbedHtml(embedHtmlFixture()), [
    "spotify:track:AAA",
    "spotify:track:BBB",
    "spotify:track:CCC",
  ]);
});

Deno.test("extractTrackUrisFromEmbedHtml returns [] when the embed can't be parsed", () => {
  assertEquals(extractTrackUrisFromEmbedHtml("<html>no next data here</html>"), []);
  assertEquals(extractTrackUrisFromEmbedHtml('<script id="__NEXT_DATA__">{not json}</script>'), []);
});

// A realistic Sierra & Thad-style dataset: filled single-track moments,
// tombstoned moments, a special non-template section, a custom moment, the
// four playlist sections, and non-exportable rows (announcement, notes).
function sierraThadRows(): SelectionRow[] {
  return [
    // single-track moments
    { section_id: "first-dance", spotify_url: "https://open.spotify.com/track/39X2xdmnX3UAWNmyhKdVtc", song_title: "Dive", artist: "Olivia Dean", notes: null },
    { section_id: "the-kiss", spotify_url: "https://open.spotify.com/track/5LYMamLv12UPbemOaTPyeV", song_title: "Music For a Sushi Restaurant", artist: "Harry Styles", notes: null },
    // tombstoned/deleted moments — null url, must NOT export
    { section_id: "ceremony-exit", spotify_url: null, song_title: null, artist: null, notes: null },
    { section_id: "bouquet-toss", spotify_url: null, song_title: null, artist: null, notes: null },
    // special, non-template hardcoded section (per-client special add) — exports as a track
    { section_id: "second-look-entrance", spotify_url: "https://open.spotify.com/track/0ccoGCaOFCxI6pHixrQpKj", song_title: "Neverender", artist: "Justice, Tame Impala", notes: null },
    // custom moment: definition row (label only) + the actual song row
    { section_id: "custom-def-1700000000", spotify_url: null, song_title: "__custom_def__", artist: null, notes: "Concessional" },
    { section_id: "custom-1700000000", spotify_url: "https://open.spotify.com/track/4lcnmk02v9b4i9ICtFupEV", song_title: "Don't Stop Me Now", artist: "Queen", notes: null },
    // the four playlist sections (client pasted Spotify playlist URLs) — export as playlists
    { section_id: "guest-seating", spotify_url: "https://open.spotify.com/playlist/5aKuzqgYigHcUlcWTvKQFi?si=abc", song_title: "Sauter_Guest Seating", artist: null, notes: null },
    { section_id: "cocktail-hour", spotify_url: "https://open.spotify.com/playlist/0PUGi9sgLFpy3ayPJS4unM?si=def", song_title: "Cocktail", artist: null, notes: null },
    { section_id: "dinner-hour", spotify_url: "https://open.spotify.com/playlist/04ixvzyU733OjHBAXwaEbT", song_title: "Dinner", artist: null, notes: null },
    { section_id: "dance-floor", spotify_url: "https://open.spotify.com/playlist/5NWTfLu3RSpIgn7fCw3F2f", song_title: "Late Night Wedding", artist: null, notes: null },
    // non-exportable rows
    { section_id: "announcement", spotify_url: null, song_title: "Mr and Mrs Sauter", artist: null, notes: null },
    { section_id: "first-dance-notes", spotify_url: null, song_title: null, artist: null, notes: "start at 0:30" },
    // orphan brochure entry clients can't edit — must NOT export
    { section_id: "dance-floor-must-plays", spotify_url: "https://open.spotify.com/playlist/xxxxxxxxx", song_title: null, artist: null, notes: null },
    // title present but url null — brochure hides it, so must NOT export
    { section_id: "cake-cutting", spotify_url: null, song_title: "Some Song", artist: "Someone", notes: null },
  ];
}

Deno.test("excludes tombstoned/deleted sections (ceremony-exit, bouquet-toss)", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids.includes("ceremony-exit"), false);
  assertEquals(ids.includes("bouquet-toss"), false);
});

Deno.test("excludes announcement, -notes, and the orphan dance-floor-must-plays", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids.includes("announcement"), false);
  assertEquals(ids.includes("first-dance-notes"), false);
  assertEquals(ids.includes("dance-floor-must-plays"), false);
});

Deno.test("excludes rows with a title but null url (brochure hides these)", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids.includes("cake-cutting"), false);
});

Deno.test("includes the four playlist sections, marked kind=playlist with program labels", () => {
  const out = selectExportSections(sierraThadRows());
  const byId = Object.fromEntries(out.map((s) => [s.section_id, s]));
  assertEquals(byId["guest-seating"]?.kind, "playlist");
  assertEquals(byId["guest-seating"]?.label, "Guest Seating");
  assertEquals(byId["cocktail-hour"]?.label, "Cocktail Hour");
  assertEquals(byId["dinner-hour"]?.label, "Dinner Hour");
  assertEquals(byId["dance-floor"]?.label, "Dance Floor Must Plays");
  assertEquals(byId["dance-floor"]?.kind, "playlist");
});

Deno.test("single-track moments are marked kind=track", () => {
  const out = selectExportSections(sierraThadRows());
  const byId = Object.fromEntries(out.map((s) => [s.section_id, s]));
  assertEquals(byId["first-dance"]?.kind, "track");
  assertEquals(byId["second-look-entrance"]?.kind, "track");
});

Deno.test("includes custom moment song with label from its custom-def row, excludes the def row", () => {
  const out = selectExportSections(sierraThadRows());
  const ids = out.map((s) => s.section_id);
  assertEquals(ids.includes("custom-def-1700000000"), false);
  assertEquals(out.find((s) => s.section_id === "custom-1700000000")?.label, "Concessional");
});

Deno.test("exports the real program, playlist sections interleaved in chronological order", () => {
  const ids = selectExportSections(sierraThadRows()).map((s) => s.section_id);
  assertEquals(ids, [
    "guest-seating",   // 1
    "the-kiss",        // 4
    "cocktail-hour",   // 6
    "dinner-hour",     // 7
    "first-dance",     // 10
    "dance-floor",     // 16
    "second-look-entrance", // non-template -> 90
    "custom-1700000000",    // custom -> 99
  ]);
});

Deno.test("extractSpotifyPlaylistId strips query params", () => {
  assertEquals(extractSpotifyPlaylistId("https://open.spotify.com/playlist/5aKuzqgYigHcUlcWTvKQFi?si=abc"), "5aKuzqgYigHcUlcWTvKQFi");
  assertEquals(extractSpotifyPlaylistId("https://open.spotify.com/playlist/04ixvzyU733OjHBAXwaEbT"), "04ixvzyU733OjHBAXwaEbT");
  assertEquals(extractSpotifyPlaylistId("https://open.spotify.com/track/39X2xdmnX3UAWNmyhKdVtc"), null);
});

Deno.test("custom moment keeps its real label (id already carries the custom- prefix)", () => {
  // Regression: the def row is 'custom-def-' + id where id is 'custom-<ts>'.
  // Re-prefixing produced 'custom-custom-<ts>', missing the song row entirely,
  // so real labels ("Parents Dance", "Chad the Beer Guy's Walk Down") were
  // replaced by the fallback string "Custom Moment" on export.
  const rows = [
    { section_id: "custom-def-custom-1785514306580", spotify_url: null,
      song_title: "__custom_def__", notes: "Parents Dance" },
    { section_id: "custom-1785514306580",
      spotify_url: "https://open.spotify.com/track/1myZ6GQewhAzMH2dKtKSWK",
      song_title: "Dance With Me", artist: "Bruno Mars", notes: null },
  ];
  const out = selectExportSections(rows);
  assertEquals(out.length, 1);
  assertEquals(out[0].label, "Parents Dance");
  assertEquals(out[0].kind, "track");
});
