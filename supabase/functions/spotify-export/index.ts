import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EXCLUDED_SECTIONS = new Set([
  "guest-seating", "cocktail-hour", "dinner-hour", "dance-floor",
  "announcement", "additional-notes", "admin-reply",
]);

const SECTION_LABELS: Record<string, string> = {
  "wedding-party-walk": "Wedding Party Walk",
  "bride-walk":         "Bride Walk",
  "the-kiss":           "The Kiss",
  "ceremony-exit":      "Ceremony Exit",
  "party-entrance":     "Wedding Party Entrance",
  "grand-entrance":     "Grand Entrance",
  "first-dance":        "First Dance",
  "father-daughter":    "Father/Daughter Dance",
  "mother-son":         "Mother/Son Dance",
  "anniversary-dance":  "Anniversary Dance",
  "last-song":          "Last Song of the Night",
  "cake-cutting":       "Cake Cutting",
  "bouquet-toss":       "Bouquet Toss",
  "last-dance":         "Last Dance (Private)",
};

function getSectionLabel(sectionId: string): string {
  if (sectionId.startsWith("custom-def-")) return "Custom Moment";
  return SECTION_LABELS[sectionId] ?? sectionId;
}

function isSpotifyTrackUrl(url: string): boolean {
  return url.startsWith("https://open.spotify.com/track/");
}

function extractSpotifyTrackId(url: string): string | null {
  const match = url.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]+)/);
  return match ? match[1] : null;
}

async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_at: string }> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return {
    access_token: data.access_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
}

async function spotifyFetch(path: string, accessToken: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify API error ${res.status}: ${err}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function getSpotifyUserId(accessToken: string): Promise<string> {
  const data = await spotifyFetch("/me", accessToken);
  return data.id;
}

async function findPlaylistByName(name: string, userId: string, accessToken: string): Promise<string | null> {
  let offset = 0;
  while (true) {
    const data = await spotifyFetch(`/me/playlists?limit=50&offset=${offset}`, accessToken);
    const match = data.items.find((p: { name: string; id: string }) => p.name === name);
    if (match) return match.id;
    if (data.items.length < 50) return null;
    offset += 50;
  }
}

async function createPlaylist(name: string, description: string, userId: string, accessToken: string): Promise<string> {
  const data = await spotifyFetch(`/users/${userId}/playlists`, accessToken, {
    method: "POST",
    body: JSON.stringify({ name, description, public: false }),
  });
  return data.id;
}

async function updatePlaylistDescription(playlistId: string, description: string, accessToken: string) {
  await spotifyFetch(`/playlists/${playlistId}`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ description }),
  });
}

async function replacePlaylistTracks(playlistId: string, trackUris: string[], accessToken: string) {
  await spotifyFetch(`/playlists/${playlistId}/tracks`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ uris: trackUris }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { client_key, client_name } = await req.json();

    if (!client_key || !client_name) {
      return new Response(JSON.stringify({ error: "Missing client_key or client_name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: tokenRow, error: tokenErr } = await supabase
      .from("spotify_tokens")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .single();

    if (tokenErr || !tokenRow) {
      return new Response(JSON.stringify({ error: "Spotify not connected. Connect Spotify first." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = tokenRow.access_token;
    const expiresAt = new Date(tokenRow.expires_at).getTime();
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      accessToken = refreshed.access_token;
      await supabase.from("spotify_tokens").update({
        access_token: refreshed.access_token,
        expires_at: refreshed.expires_at,
        updated_at: new Date().toISOString(),
      }).eq("id", "00000000-0000-0000-0000-000000000001");
    }

    const { data: selections, error: selErr } = await supabase
      .from("wedding_selections")
      .select("section_id, spotify_url, song_title, artist")
      .eq("client_key", client_key);

    if (selErr) throw new Error(`Failed to load selections: ${selErr.message}`);

    const exportable = (selections ?? []).filter((row) => {
      if (EXCLUDED_SECTIONS.has(row.section_id)) return false;
      if (row.section_id.endsWith("-notes")) return false;
      if (row.song_title === "__custom_def__") return false;
      if (!row.spotify_url && !row.song_title) return false;
      return true;
    });

    const blanks = exportable.filter((row) => !row.spotify_url);
    if (blanks.length > 0) {
      const missingLabels = blanks.map((r) => getSectionLabel(r.section_id));
      return new Response(JSON.stringify({
        error: "Export blocked: missing songs",
        missing: missingLabels,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = await getSpotifyUserId(accessToken);
    const manualSections: string[] = [];

    for (const row of exportable) {
      const momentLabel = getSectionLabel(row.section_id);
      const playlistName = `${client_name} — ${momentLabel}`;
      const isSpotify = isSpotifyTrackUrl(row.spotify_url);

      let playlistId = await findPlaylistByName(playlistName, userId, accessToken);

      if (isSpotify) {
        const trackId = extractSpotifyTrackId(row.spotify_url);
        if (!trackId) {
          manualSections.push(momentLabel);
          const desc = row.spotify_url;
          if (playlistId) {
            await replacePlaylistTracks(playlistId, [], accessToken);
            await updatePlaylistDescription(playlistId, desc, accessToken);
          } else {
            playlistId = await createPlaylist(playlistName, desc, userId, accessToken);
          }
          continue;
        }

        const trackUri = `spotify:track:${trackId}`;
        if (playlistId) {
          await replacePlaylistTracks(playlistId, [trackUri], accessToken);
          await updatePlaylistDescription(playlistId, "", accessToken);
        } else {
          playlistId = await createPlaylist(playlistName, "", userId, accessToken);
          await replacePlaylistTracks(playlistId, [trackUri], accessToken);
        }
      } else {
        manualSections.push(momentLabel);
        const desc = row.spotify_url;
        if (playlistId) {
          await replacePlaylistTracks(playlistId, [], accessToken);
          await updatePlaylistDescription(playlistId, desc, accessToken);
        } else {
          playlistId = await createPlaylist(playlistName, desc, userId, accessToken);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      exported: exportable.length,
      manual: manualSections,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
