const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { clientKey, sectionId, spotifyUrl, songTitle, artist, notes, deleted, customDef } = await req.json();

    if (!clientKey || !sectionId) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (customDef) {
      // Save custom moment definition (label stored in notes, no spotify_url)
      await fetch(`${supabaseUrl}/rest/v1/wedding_selections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          client_key: clientKey,
          section_id: sectionId,
          spotify_url: null,
          song_title: '__custom_def__',
          artist: null,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
      });
    } else if (deleted) {
      // Upsert a "deleted" marker row
      await fetch(`${supabaseUrl}/rest/v1/wedding_selections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          client_key: clientKey,
          section_id: sectionId,
          spotify_url: null,
          song_title: null,
          artist: null,
          notes: null,
          updated_at: new Date().toISOString()
        })
      });
    } else {
      await fetch(`${supabaseUrl}/rest/v1/wedding_selections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          client_key: clientKey,
          section_id: sectionId,
          spotify_url: spotifyUrl || null,
          song_title: songTitle || null,
          artist: artist || null,
          notes: notes || null,
          updated_at: new Date().toISOString()
        })
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});