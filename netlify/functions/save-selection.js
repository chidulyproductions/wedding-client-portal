
const https = require('https');

function httpsRequest(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers
    };
    if (body) options.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async function(event) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { clientKey, sectionId, spotifyUrl, songTitle, artist, notes } = JSON.parse(event.body || '{}');

  if (!clientKey || !sectionId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) };
  }

  const payload = JSON.stringify({
    client_key: clientKey,
    section_id: sectionId,
    spotify_url: spotifyUrl || null,
    song_title: songTitle || null,
    artist: artist || null,
    notes: notes || null,
    updated_at: new Date().toISOString()
  });

  try {
    const res = await httpsRequest(
      'POST',
      `${supabaseUrl}/rest/v1/wedding_selections?on_conflict=client_key,section_id`,
      {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Prefer': 'resolution=merge-duplicates'
      },
      payload
    );

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ success: true })
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
