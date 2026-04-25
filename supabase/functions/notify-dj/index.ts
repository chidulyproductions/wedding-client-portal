import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hardcoded section ID → label map. Keys MUST match brochure `section_id`s
// in spotify-selections.html.
const SECTION_LABELS: Record<string, string> = {
  "guest-seating":            "Guest Seating",
  "wedding-party-walk":       "Wedding Party Walk",
  "bride-walk":               "Bride Walk",
  "the-kiss":                 "The Kiss",
  "ceremony-exit":            "Ceremony Exit",
  "cocktail-hour":            "Cocktail Hour",
  "dinner-hour":              "Dinner Hour",
  "wedding-party-entrance":   "Wedding Party Entrance",
  "grand-entrance":           "Grand Entrance",
  "announcement":             "Grand Entrance Announcement",
  "first-dance":              "First Dance",
  "father-daughter":          "Father/Daughter Dance",
  "mother-son":               "Mother/Son Dance",
  "anniversary-dance":        "Anniversary Dance",
  "last-song-of-the-night":   "Last Song of the Night",
  "cake-cutting":             "Cake Cutting",
  "bouquet-toss":             "Bouquet Toss",
  "dance-floor":              "Dance Floor (legacy)",
  "dance-floor-must-plays":   "Dance Floor Must Plays",
  "last-dance":               "Last Dance (Private)",
  "last-dance-private":       "Last Dance (Private)",
  "additional-notes":         "Additional Notes",
  "admin-reply":              "Admin Reply",
};

function getSectionLabel(sectionId: string): string {
  // Custom moment definitions
  if (sectionId.startsWith("custom-def-")) {
    return "Custom Moment Definition";
  }

  // Sections ending in -notes: strip suffix, look up base, append " Notes"
  if (sectionId.endsWith("-notes")) {
    const base = sectionId.slice(0, -"-notes".length);
    const baseLabel = SECTION_LABELS[base];
    if (baseLabel) {
      return baseLabel + " Notes";
    }
  }

  // Direct lookup
  return SECTION_LABELS[sectionId] ?? sectionId;
}

function formatWeddingDate(dateStr: string): string {
  // dateStr is "YYYY-MM-DD" from Postgres date column
  // Parse as UTC to avoid timezone shift (date-only strings shouldn't shift)
  const [year, month, day] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function formatSongLine(title: string | null, artist: string | null, spotifyUrl: string | null): string {
  if (!spotifyUrl && !title && !artist) return "—";
  const parts: string[] = [];
  if (title) parts.push(escapeHtml(title));
  if (artist) parts.push(`by ${escapeHtml(artist)}`);
  return parts.length > 0 ? parts.join(" ") : "—";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (!RESEND_API_KEY) {
    return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json();
    const {
      client_key,
      section_id,
      old_song_title,
      old_artist,
      old_spotify_url,
      new_song_title,
      new_artist,
      new_spotify_url,
    } = payload;

    if (!client_key || !section_id) {
      return new Response(JSON.stringify({ error: "Missing client_key or section_id" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the service role key so we can read and write the clients table
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Look up the client by reconstructing the client_key from name + wedding_date.
    // The derivation formula (from the frontend) is:
    //   (name + '-' + wedding_date).toLowerCase().replace(/[^a-z0-9-]/g, '-')
    // The JS client can't filter on computed expressions, so we fetch all clients
    // and match in JS. The table will never exceed ~100 rows so this is fine.
    const { data: allClients, error: fetchError } = await supabase
      .from("clients")
      .select("id, name, wedding_date, last_notified_at");

    if (fetchError) {
      return new Response(JSON.stringify({ error: "Failed to fetch clients: " + fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reconstruct the client_key from each client row and find the match
    const matchedClient = (allClients ?? []).find((c) => {
      const derived = (c.name + "-" + c.wedding_date)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      return derived === client_key;
    });

    if (!matchedClient) {
      return new Response(JSON.stringify({ error: "Client not found for key: " + client_key }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Debounce: skip if last_notified_at was less than 30 minutes ago
    if (matchedClient.last_notified_at) {
      const lastNotified = new Date(matchedClient.last_notified_at).getTime();
      const thirtyMinutesMs = 30 * 60 * 1000;
      if (Date.now() - lastNotified < thirtyMinutesMs) {
        return new Response(JSON.stringify({ skipped: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const clientName = matchedClient.name;
    const weddingDateFormatted = formatWeddingDate(matchedClient.wedding_date);
    const momentLabel = getSectionLabel(section_id);

    // Build the before/after display strings
    const beforeLine = formatSongLine(old_song_title ?? null, old_artist ?? null, old_spotify_url ?? null);
    // "After" shows "(removed)" if new_spotify_url is null
    const afterLine = (new_spotify_url == null)
      ? "(removed)"
      : formatSongLine(new_song_title ?? null, new_artist ?? null, new_spotify_url);

    const emailHtml = `
      <div style="font-family: 'Georgia', serif; max-width: 560px; margin: 0 auto; color: #1a1218;">
        <h2 style="color: #a07840; font-weight: 400; margin-bottom: 4px;">Chi Duly Productions</h2>
        <p style="color: #7a7385; font-size: 14px; margin-top: 0;">Wedding Music Program</p>
        <hr style="border: none; border-top: 1px solid #e0dce5; margin: 20px 0;" />
        <p style="font-size: 15px; line-height: 1.7;">${escapeHtml(clientName)} made a change to their music program.</p>
        <p style="font-size: 14px; color: #7a7385; margin-top: 0;">Wedding date: ${escapeHtml(weddingDateFormatted)}</p>
        <blockquote style="border-left: 3px solid #a07840; background: #faf6f1; padding: 12px 16px; margin: 16px 0;">
          <p style="font-size: 13px; font-weight: bold; letter-spacing: 0.05em; color: #7a7385; margin: 0 0 8px 0; text-transform: uppercase;">${escapeHtml(momentLabel)}</p>
          <p style="font-size: 14px; line-height: 1.6; margin: 4px 0;"><strong>Before:</strong> ${beforeLine}</p>
          <p style="font-size: 14px; line-height: 1.6; margin: 4px 0;"><strong>After:</strong> ${afterLine}</p>
        </blockquote>
        <p style="font-size: 15px; line-height: 1.7;"><a href="https://chidulyproductions.github.io/wedding-client-portal/admin.html" style="color: #a07840;">View their portal →</a></p>
        <hr style="border: none; border-top: 1px solid #e0dce5; margin: 20px 0;" />
        <p style="color: #7a7385; font-size: 12px;">&copy; 2026 Chi Duly Productions</p>
      </div>
    `;

    // Send the email via Resend
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Chi Duly Productions <notifications@chiduly.com>",
        to: ["chris@chiduly.com"],
        subject: `${clientName} updated their music — ${momentLabel}`,
        html: emailHtml,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      // Do NOT update last_notified_at so the next save retries
      return new Response(JSON.stringify({ error: data.message || "Email send failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Only update last_notified_at after a confirmed successful Resend call
    const { error: updateError } = await supabase
      .from("clients")
      .update({ last_notified_at: new Date().toISOString() })
      .eq("id", matchedClient.id);

    if (updateError) {
      // Email was sent successfully; log the update failure but don't error out
      console.error("Failed to update last_notified_at:", updateError.message);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
