// Pure selection logic for the Spotify export — decides WHICH sections of a
// client's program become single-track playlists, and what each is named.
//
// The guiding rule: the export must mirror the client's brochure exactly. The
// brochure shows a moment only when its row has a non-null `spotify_url`; any
// null-url row is a tombstone (deleted/never-filled) and is hidden. So export
// here filters to the same set, rather than walking a hardcoded list of every
// standard moment (which is what caused empty "phantom" playlists for deleted
// sections like Ceremony Exit / Bouquet Toss, and dropped non-template moments
// like a per-client special add or a custom category).
//
// Kept side-effect-free so it can be unit-tested without Spotify/Supabase.

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
  spotify_url: string;
}

// Sections that are never single-track exports: playlist embeds, free text,
// and admin/meta rows.
export const EXCLUDED_SECTIONS = new Set<string>([
  "guest-seating", "cocktail-hour",
  "dinner-hour", "dance-floor", "dance-floor-must-plays",
  "announcement", "additional-notes", "admin-reply",
]);

// Default-template moments only. Per-client special additions (e.g.
// "second-look-entrance") and custom categories are intentionally NOT listed
// here — they are resolved dynamically so they are not baked into the template.
export const SECTION_LABELS: Record<string, string> = {
  "wedding-party-walk":       "Wedding Party Walk",
  "bride-walk":               "Bride Walk",
  "the-kiss":                 "The Kiss",
  "ceremony-exit":            "Ceremony Exit",
  "wedding-party-entrance":   "Wedding Party Entrance",
  "grand-entrance":           "Grand Entrance",
  "first-dance":              "First Dance",
  "father-daughter":          "Father/Daughter Dance",
  "mother-son":               "Mother/Son Dance",
  "anniversary-dance":        "Anniversary Dance",
  "cake-cutting":             "Cake Cutting",
  "bouquet-toss":             "Bouquet Toss",
  "last-song-of-the-night":   "Last Song of the Night",
  "last-dance":               "Last Dance (Private)",
  "last-dance-private":       "Last Dance (Private)",
};

export const SECTION_ORDER: Record<string, number> = {
  "wedding-party-walk":       1,
  "bride-walk":               2,
  "the-kiss":                 3,
  "ceremony-exit":            4,
  "wedding-party-entrance":   5,
  "grand-entrance":           6,
  "first-dance":              7,
  "father-daughter":          8,
  "mother-son":               9,
  "anniversary-dance":        10,
  "cake-cutting":             11,
  "bouquet-toss":             12,
  "last-song-of-the-night":   13,
  "last-dance":               14,
  "last-dance-private":       14,
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
 * Returns the ordered set of single-track sections to export for a client,
 * mirroring exactly what the brochure displays. Each result carries a
 * human-readable label and a numeric sort order.
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
    out.push({ section_id: id, label, order, spotify_url: row.spotify_url });
  }

  out.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  return out;
}

// Zero-padded prefix so playlist names sort chronologically in Spotify's A-Z view.
export function orderPrefix(order: number): string {
  return String(order).padStart(2, "0") + " ";
}
