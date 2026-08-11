// Before/after line rendering for the DJ notification email. Split out of
// index.ts so it can be unit-tested — same split as spotify-export/selection.ts.

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatSongLine(
  title: string | null,
  artist: string | null,
  spotifyUrl: string | null,
): string {
  if (!spotifyUrl && !title && !artist) return "—";
  const parts: string[] = [];
  if (title) parts.push(escapeHtml(title));
  if (artist) parts.push(`by ${escapeHtml(artist)}`);
  return parts.length > 0 ? parts.join(" ") : "—";
}

// A null spotify_url used to mean one thing — the moment was removed. It now
// also occurs on a moment whose only content is an uploaded file, so audio has
// to be consulted before calling anything a removal.
export function formatAfterLine(
  title: string | null,
  artist: string | null,
  spotifyUrl: string | null,
  audioUrl: string | null,
): string {
  if (audioUrl) {
    const song = formatSongLine(title, artist, spotifyUrl);
    return song === "—" ? "Custom audio uploaded" : `${song} (custom audio)`;
  }
  if (spotifyUrl == null) return "(removed)";
  return formatSongLine(title, artist, spotifyUrl);
}
