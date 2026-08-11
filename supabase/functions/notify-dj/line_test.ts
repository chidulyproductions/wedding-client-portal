import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { escapeHtml, formatSongLine, formatAfterLine } from "./line.ts";

Deno.test("escapeHtml neutralizes markup", () => {
  assertEquals(escapeHtml(`<b>&"x"</b>`), "&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
});

Deno.test("formatSongLine renders title and artist", () => {
  assertEquals(formatSongLine("At Last", "Etta James", "https://open.spotify.com/track/x"), "At Last by Etta James");
});

Deno.test("formatSongLine renders an em dash when there is nothing to show", () => {
  assertEquals(formatSongLine(null, null, null), "—");
});

// The bug this module exists to fix: an audio-only upload leaves spotify_url
// null, and the old code rendered that as "(removed)" — telling Chris the
// couple deleted a moment they had actually just added a custom edit to.
Deno.test("formatAfterLine reports an upload, not a removal, when audio is attached", () => {
  assertEquals(
    formatAfterLine(null, null, null, "https://x.supabase.co/storage/v1/object/public/client-audio/abc.mp3"),
    "Custom audio uploaded",
  );
});

Deno.test("formatAfterLine names the audio when a title is present", () => {
  assertEquals(
    formatAfterLine("Vows Recording", null, null, "https://x.supabase.co/storage/v1/object/public/client-audio/abc.mp3"),
    "Vows Recording (custom audio)",
  );
});

Deno.test("formatAfterLine marks a link that also has a custom edit", () => {
  assertEquals(
    formatAfterLine("At Last", "Etta James", "https://open.spotify.com/track/x", "https://x.supabase.co/storage/v1/object/public/client-audio/abc.mp3"),
    "At Last by Etta James (custom audio)",
  );
});

Deno.test("formatAfterLine still reports a genuine removal", () => {
  assertEquals(formatAfterLine(null, null, null, null), "(removed)");
});

Deno.test("formatAfterLine is unchanged for an ordinary link", () => {
  assertEquals(
    formatAfterLine("At Last", "Etta James", "https://open.spotify.com/track/x", null),
    "At Last by Etta James",
  );
});

Deno.test("formatAfterLine escapes a hostile title", () => {
  assertEquals(
    formatAfterLine(`<script>x</script>`, null, null, "https://x/audio.mp3"),
    "&lt;script&gt;x&lt;/script&gt; (custom audio)",
  );
});
