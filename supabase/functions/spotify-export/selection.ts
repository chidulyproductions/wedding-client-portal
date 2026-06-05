// Pure selection logic for the Spotify export — decides WHICH sections of a
// client's program become Spotify playlists, what each is named, and whether
// each is a single-track moment or a multi-track playlist section.
//
// The guiding rule: the export must mirror the client's brochure exactly. The
// brochure shows a moment only when its row has a non-null `spotify_url`; any
// null-url row is a tombstone (deleted/never-filled) and is hidden. So export
// here filters to the same set, rather than walking a hardcoded list of every
// standard moment (which caused empty "phantom" playlists for deleted sections
// and dropped non-template moments like a per-client special add).
//
// Two kinds of export:
//   - "track":    a single song → a one-track playlist in the DJ's account.
//   - "playlist": the client pasted a Spotify *playlist* URL (guest seating,
//                 cocktail, dinner, dance floor) → the DJ gets a playlist with
//                 those same tracks copied in.
//
// Kept side-effect-free so it can be unit-tested without Spotify/Supabase.

export type ExportKind = "track" | "playlist";

export interface SelectionRow {
  section_id: string;
  spotify_url: string | null;
  song_title: string | null;
  artist?: string | null;
  notes?: string | null;
}

export interface ExportSection {
  section_id: string;
  label: string;
  order: number;
  kind: ExportKind;
  spotify_url: string;
}

// Multi-track playlist sections: the client's value is a Spotify playlist URL.
export const PLAYLIST_SECTIONS = new Set<string>([
  "guest-seating", "cocktail-hour", "dinner-hour", "dance-floor",
]);

// Rows that are never exported: free text, admin/meta, and the orphan
// "dance-floor-must-plays" brochure entry that clients cannot edit.
export const EXCLUDED_SECTIONS = new Set<string>([
  "dance-floor-must-plays",
  "announcement", "additional-notes", "admin-reply",
]);

// Labels for default-template moments + playlist sections. Match the brochure's
// `sectionProgramMap` labels in spotify-selections.html. Per-client special
// additions (e.g. "second-look-entrance") and custom categories are NOT listed
// here — they are resolved dynamically so they are not baked into the template.
export const SECTION_LABELS: Record<string, string> = {
  "guest-seating":            "Guest Seating",
  "wedding-party-walk":       "Wedding Party Walk",
  "bride-walk":               "Bride Walk",
  "the-kiss":                 "The Kiss",
  "ceremony-exit":            "Ceremony Exit",
  "cocktail-hour":            "Cocktail Hour",
  "dinner-hour":              "Dinner Hour",
  "wedding-party-entrance":   "Wedding Party Entrance",
  "grand-entrance":           "Grand Entrance",
  "first-dance":              "First Dance",
  "father-daughter":          "Father/Daughter Dance",
  "mother-son":               "Mother/Son Dance",
  "anniversary-dance":        "Anniversary Dance",
  "cake-cutting":             "Cake Cutting",
  "bouquet-toss":             "Bouquet Toss",
  "dance-floor":              "Dance Floor Must Plays",
  "last-song-of-the-night":   "Last Song of the Night",
  "last-dance":               "Last Dance (Private)",
  "last-dance-private":       "Last Dance (Private)",
};

// One chronological sequence covering single-track moments and playlist
// sections, so Spotify's A-Z playlist sort = the wedding program order.
export const SECTION_ORDER: Record<string, number> = {
  "guest-seating":            1,
  "wedding-party-walk":       2,
  "bride-walk":               3,
  "the-kiss":                 4,
  "ceremony-exit":            5,
  "cocktail-hour":            6,
  "dinner-hour":              7,
  "wedding-party-entrance":   8,
  "grand-entrance":           9,
  "first-dance":              10,
  "father-daughter":          11,
  "mother-son":               12,
  "anniversary-dance":        13,
  "cake-cutting":             14,
  "bouquet-toss":             15,
  "dance-floor":              16,
  "last-song-of-the-night":   17,
  "last-dance":               18,
  "last-dance-private":       18,
};

// Non-template sections sort after all template moments. Special hardcoded
// sections (e.g. second-look-entrance) come before custom moments.
const NON_TEMPLATE_ORDER = 90;
const CUSTOM_ORDER = 99;

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

function isNonExportableRow(row: SelectionRow): boolean {
  if (EXCLUDED_SECTIONS.has(row.section_id)) return true;
  if (row.section_id.endsWith("-notes")) return true;
  if (row.song_title === "__custom_def__") return true; // custom-moment definition, not a song
  return false;
}

/**
 * Returns the ordered set of sections to export for a client, mirroring exactly
 * what the brochure displays. Each result carries a human-readable label, a
 * numeric sort order, and a kind ("track" or "playlist").
 */
export function selectExportSections(rows: SelectionRow[]): ExportSection[] {
  // Resolve custom-moment labels: a `custom-def-<id>` row holds the label in
  // `notes`; the actual song lives in the `custom-<id>` row.
  const customLabels: Record<string, string> = {};
  for (const row of rows) {
    if (row.song_title === "__custom_def__" && row.section_id.startsWith("custom-def-")) {
      const id = "custom-" + row.section_id.slice("custom-def-".length);
      customLabels[id] = (row.notes && row.notes.trim()) || "Custom Moment";
    }
  }

  const out: ExportSection[] = [];
  for (const row of rows) {
    if (isNonExportableRow(row)) continue;
    if (!row.spotify_url) continue; // tombstone / not shown in program → don't export

    const id = row.section_id;
    let label: string;
    let order: number;
    if (id in SECTION_LABELS) {
      label = SECTION_LABELS[id];
      order = SECTION_ORDER[id];
    } else if (id.startsWith("custom-")) {
      label = customLabels[id] ?? "Custom Moment";
      order = CUSTOM_ORDER;
    } else {
      label = slugToTitle(id);
      order = NON_TEMPLATE_ORDER;
    }
    const kind: ExportKind = PLAYLIST_SECTIONS.has(id) ? "playlist" : "track";
    out.push({ section_id: id, label, order, kind, spotify_url: row.spotify_url });
  }

  out.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return out;
}

// Zero-padded prefix so playlist names sort chronologically in Spotify's A-Z view.
export function orderPrefix(order: number): string {
  return String(order).padStart(2, "0") + " ";
}

export function extractSpotifyPlaylistId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}
