import "@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { selectExportSections, orderPrefix, extractSpotifyPlaylistId, extractTrackUrisFromEmbedHtml } from "./selection.ts"

const SPOTIFY_CLIENT_ID = Deno.env.get("SPOTIFY_CLIENT_ID")!;
const SPOTIFY_CLIENT_SECRET = Deno.env.get("SPOTIFY_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  // Some Spotify endpoints (e.g. PUT /playlists/{id}) return 200 with an empty body
  const text = await res.text();
  return text ? JSON.parse(text) : null;
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

// Spotify caps track-write requests at 100 URIs. Replace the playlist with the
// first 100 (PUT) and append the rest in chunks of 100 (POST).
async function replacePlaylistTracks(playlistId: string, trackUris: string[], accessToken: string) {
  const first = trackUris.slice(0, 100);
  await spotifyFetch(`/playlists/${playlistId}/tracks`, accessToken, {
    method: "PUT",
    body: JSON.stringify({ uris: first }),
  });
  for (let i = 100; i < trackUris.length; i += 100) {
    await spotifyFetch(`/playlists/${playlistId}/tracks`, accessToken, {
      method: "POST",
      body: JSON.stringify({ uris: trackUris.slice(i, i + 100) }),
    });
  }
}

// Fallback for playlists the Web API can't read (Spotify's own algorithmic/
// editorial playlists 404): the public embed page still lists the tracks. Copying
// those known URIs into the DJ's own playlist is allowed. Best-effort — returns []
// if the embed can't be fetched/parsed, so the caller degrades to a manual playlist.
async function fetchPlaylistTrackUrisViaEmbed(playlistId: string): Promise<string[]> {
  const res = await fetch(`https://open.spotify.com/embed/playlist/${playlistId}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; ChiDulyExport/1.0)" },
  });
  if (!res.ok) return [];
  const html = await res.text();
  return extractTrackUrisFromEmbedHtml(html);
}

// Read every track URI from a source playlist (the client-pasted playlist),
// paginating 100 at a time. Skips local files and non-track items (e.g.
// podcast episodes) which can't be re-added to another playlist.
async function fetchPlaylistTrackUris(playlistId: string, accessToken: string): Promise<string[]> {
  const uris: string[] = [];
  let offset = 0;
  while (true) {
    const data = await spotifyFetch(
      `/playlists/${playlistId}/tracks?limit=100&offset=${offset}&fields=items(track(uri,type,is_local)),next`,
      accessToken,
    );
    for (const item of data.items ?? []) {
      const track = item?.track;
      if (track && track.type === "track" && !track.is_local && typeof track.uri === "string") {
        uris.push(track.uri);
      }
    }
    if (!data.next || (data.items?.length ?? 0) < 100) break;
    offset += 100;
  }
  return uris;
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
      .select("section_id, spotify_url, song_title, artist, notes")
      .eq("client_key", client_key);

    if (selErr) throw new Error(`Failed to load selections: ${selErr.message}`);

    // Mirror the brochure: export exactly the moments the client's program shows.
    // selectExportSections drops tombstoned/empty rows, playlist embeds, notes,
    // and custom-moment definition rows — and resolves labels + chronological
    // order, including for per-client special and custom sections. This replaces
    // the old behavior of walking a hardcoded list of every standard moment,
    // which created empty "phantom" playlists for deleted/never-filled sections.
    const sections = selectExportSections(selections ?? []);

    const userId = await getSpotifyUserId(accessToken);
    const manualSections: string[] = [];
    const failedSections: string[] = [];
    const viaEmbedSections: string[] = [];
    const exportedPlaylists: { section_id: string; playlist_id: string; playlist_name: string; playlist_url: string }[] = [];

    for (const section of sections) {
      const { section_id: sectionId, label: momentLabel, spotify_url: spotifyUrl } = section;
      const playlistName = `${client_name} — ${orderPrefix(section.order)}${momentLabel}`;

      try {
        let playlistId = await findPlaylistByName(playlistName, userId, accessToken);

        if (section.kind === "playlist") {
          // Playlist section: copy the tracks from the client's pasted playlist
          // into a playlist of the same name in the DJ's account.
          const sourceId = extractSpotifyPlaylistId(spotifyUrl);
          if (!sourceId) {
            // Not a Spotify playlist URL — record the link for manual handling.
            manualSections.push(momentLabel);
            if (playlistId) {
              await replacePlaylistTracks(playlistId, [], accessToken);
              await updatePlaylistDescription(playlistId, spotifyUrl, accessToken);
            } else {
              playlistId = await createPlaylist(playlistName, spotifyUrl, userId, accessToken);
            }
          } else {
            // Read the source playlist's tracks. Spotify's Web API returns 404 for
            // its own algorithmic/editorial playlists (blocked since Nov 2024), and
            // user playlists can be private/deleted. On failure, fall back to the
            // public embed (which still lists the tracks) so we can copy the songs
            // anyway. If even that fails, degrade to a manual playlist (empty, with
            // the source link in the description) rather than aborting the export.
            let trackUris: string[] | null = null;
            try {
              trackUris = await fetchPlaylistTrackUris(sourceId, accessToken);
            } catch (fetchErr) {
              console.error(
                `API could not read source playlist for "${momentLabel}" (${spotifyUrl}); trying embed:`,
                fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
              );
              try {
                const embedUris = await fetchPlaylistTrackUrisViaEmbed(sourceId);
                if (embedUris.length > 0) {
                  trackUris = embedUris;
                  viaEmbedSections.push(momentLabel);
                }
              } catch (embedErr) {
                console.error(
                  `Embed fallback also failed for "${momentLabel}":`,
                  embedErr instanceof Error ? embedErr.message : String(embedErr),
                );
              }
            }
            if (trackUris === null) {
              manualSections.push(momentLabel);
              if (playlistId) {
                await replacePlaylistTracks(playlistId, [], accessToken);
                await updatePlaylistDescription(playlistId, spotifyUrl, accessToken);
              } else {
                playlistId = await createPlaylist(playlistName, spotifyUrl, userId, accessToken);
              }
            } else {
              if (!playlistId) {
                playlistId = await createPlaylist(playlistName, spotifyUrl, userId, accessToken);
              } else {
                await updatePlaylistDescription(playlistId, spotifyUrl, accessToken);
              }
              await replacePlaylistTracks(playlistId, trackUris, accessToken);
            }
          }
        } else if (isSpotifyTrackUrl(spotifyUrl)) {
          const trackId = extractSpotifyTrackId(spotifyUrl);
          if (!trackId) {
            // Malformed Spotify URL — treat as manual
            manualSections.push(momentLabel);
            if (playlistId) {
              await replacePlaylistTracks(playlistId, [], accessToken);
              await updatePlaylistDescription(playlistId, spotifyUrl, accessToken);
            } else {
              playlistId = await createPlaylist(playlistName, spotifyUrl, userId, accessToken);
            }
          } else {
            const trackUri = `spotify:track:${trackId}`;
            if (playlistId) {
              await replacePlaylistTracks(playlistId, [trackUri], accessToken);
              await updatePlaylistDescription(playlistId, "", accessToken);
            } else {
              playlistId = await createPlaylist(playlistName, "", userId, accessToken);
              await replacePlaylistTracks(playlistId, [trackUri], accessToken);
            }
          }
        } else {
          // Non-Spotify URL (YouTube, SoundCloud, etc.) — empty playlist, URL in description
          manualSections.push(momentLabel);
          if (playlistId) {
            await replacePlaylistTracks(playlistId, [], accessToken);
            await updatePlaylistDescription(playlistId, spotifyUrl, accessToken);
          } else {
            playlistId = await createPlaylist(playlistName, spotifyUrl, userId, accessToken);
          }
        }

        if (playlistId) {
          exportedPlaylists.push({
            section_id: sectionId,
            playlist_id: playlistId,
            playlist_name: playlistName,
            playlist_url: `https://open.spotify.com/playlist/${playlistId}`,
          });
        }
      } catch (sectionErr) {
        // Any unexpected Spotify error on one section (rate limit, transient 5xx,
        // a write failure, etc.) must not abort the whole batch — record it and
        // keep exporting the remaining sections.
        console.error(
          `Export failed for section "${momentLabel}":`,
          sectionErr instanceof Error ? sectionErr.message : String(sectionErr),
        );
        failedSections.push(momentLabel);
      }
    }

    // Cleanup: empty any previously-exported playlist whose section is no longer
    // in the program (deleted/tombstoned since the last export) so stale phantom
    // playlists don't keep showing old songs. Spotify's API can't delete a
    // playlist, so we empty its tracks + description and drop our tracking row.
    const exportedSectionIds = new Set(sections.map((s) => s.section_id));
    const { data: priorPlaylists } = await supabase
      .from("spotify_playlists")
      .select("section_id, playlist_id")
      .eq("client_key", client_key);

    const stalePlaylists = (priorPlaylists ?? []).filter(
      (p) => !exportedSectionIds.has(p.section_id)
    );
    for (const stale of stalePlaylists) {
      try {
        await replacePlaylistTracks(stale.playlist_id, [], accessToken);
        await updatePlaylistDescription(stale.playlist_id, "", accessToken);
      } catch (_e) {
        // Playlist may have been deleted/unfollowed in Spotify — ignore.
      }
    }
    if (stalePlaylists.length > 0) {
      await supabase
        .from("spotify_playlists")
        .delete()
        .eq("client_key", client_key)
        .in("section_id", stalePlaylists.map((p) => p.section_id));
    }

    // Persist playlist IDs back to Supabase
    if (exportedPlaylists.length > 0) {
      await supabase.from("spotify_playlists").upsert(
        exportedPlaylists.map((p) => ({
          client_key,
          section_id: p.section_id,
          playlist_id: p.playlist_id,
          playlist_name: p.playlist_name,
          playlist_url: p.playlist_url,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "client_key,section_id" }
      );
    }

    return new Response(JSON.stringify({
      success: true,
      exported: exportedPlaylists.length,
      manual: manualSections,
      failed: failedSections,
      via_embed: viaEmbedSections,
      cleaned: stalePlaylists.length,
      playlists: exportedPlaylists,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
