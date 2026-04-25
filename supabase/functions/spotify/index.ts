import "@supabase/functions-js/edge-runtime.d.ts"

// Returns track / playlist / album metadata for a Spotify URL using the Web
// API client-credentials flow. Restores the pre-2026-03-18 architecture: this
// function originally lived at /functions/v1/spotify, was removed in commit
// 838a87e ("Fix: replace broken Spotify edge function with direct oEmbed
// API"), and is now reinstated because Spotify's public oEmbed endpoint does
// not return author_name (the artist), so the WMS client portal had been
// silently saving every Spotify selection with artist=null.
//
// Called from spotify-selections.html `fetchSongInfo()` whenever a Spotify
// URL is pasted into a section.

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function getClientCredentialsToken(): Promise<string> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`)}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Token fetch failed: HTTP ${res.status} — ${await res.text()}`);
  const data = await res.json();
  if (!data.access_token) throw new Error("Token response missing access_token");
  return data.access_token as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const spotifyUrl: string | undefined = body.spotifyUrl;

    if (!spotifyUrl) {
      return jsonResponse({ error: "Missing spotifyUrl" }, 400);
    }

    const match = spotifyUrl.match(/spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
    if (!match) {
      return jsonResponse({ error: "Invalid Spotify URL" }, 400);
    }
    const [, type, id] = match;

    const accessToken = await getClientCredentialsToken();

    const apiRes = await fetch(`https://api.spotify.com/v1/${type}s/${id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!apiRes.ok) {
      const errText = await apiRes.text();
      return jsonResponse(
        { error: `Spotify API error ${apiRes.status}`, details: errText },
        apiRes.status === 404 ? 404 : 502,
      );
    }
    const info = await apiRes.json();

    if (type === "track") {
      const artists = Array.isArray(info.artists) ? info.artists : [];
      return jsonResponse({
        type: "track",
        title: info.name ?? null,
        artist: artists.map((a: { name: string }) => a.name).join(", "),
      });
    }

    if (type === "playlist") {
      return jsonResponse({
        type: "playlist",
        title: info.name ?? null,
        owner: info.owner?.display_name ?? "",
      });
    }

    // album
    const artists = Array.isArray(info.artists) ? info.artists : [];
    return jsonResponse({
      type: "album",
      title: info.name ?? null,
      artist: artists.map((a: { name: string }) => a.name).join(", "),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});
