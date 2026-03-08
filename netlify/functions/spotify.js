const https = require('https');

function httpsPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGet(url, headers) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async function(event) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const body = JSON.parse(event.body || '{}');
  const spotifyUrl = body.spotifyUrl;

  if (!spotifyUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No URL provided' }) };
  }

  const match = spotifyUrl.match(/spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
  if (!match) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Spotify URL' }) };
  }

  const [, type, id] = match;

  try {
    // Get access token
    const tokenBody = 'grant_type=client_credentials';
    const credentials = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    const tokenRes = await httpsPost(
      'https://accounts.spotify.com/api/token',
      {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + credentials
      },
      tokenBody
    );

    const tokenData = JSON.parse(tokenRes.body);
    const accessToken = tokenData.access_token;

    if (!accessToken) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Could not get Spotify token' }) };
    }

    // Fetch track or playlist info
    const endpoint = type === 'track'
      ? `https://api.spotify.com/v1/tracks/${id}`
      : `https://api.spotify.com/v1/playlists/${id}`;

    const infoRes = await httpsGet(endpoint, {
      'Authorization': 'Bearer ' + accessToken
    });

    const info = JSON.parse(infoRes.body);

    let result = {};
    if (type === 'track') {
      result = {
        type: 'track',
        title: info.name,
        artist: info.artists ? info.artists.map(a => a.name).join(', ') : ''
      };
    } else {
      result = {
        type: 'playlist',
        title: info.name,
        owner: info.owner ? info.owner.display_name : ''
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
