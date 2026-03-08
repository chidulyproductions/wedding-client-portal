exports.handler = async function(event) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const { spotifyUrl } = JSON.parse(event.body || '{}');

  if (!spotifyUrl) {
    return { statusCode: 400, body: JSON.stringify({ error: 'No URL provided' }) };
  }

  // Extract type and ID from Spotify URL
  const match = spotifyUrl.match(/spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/);
  if (!match) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid Spotify URL' }) };
  }

  const [, type, id] = match;

  try {
    // Get access token
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
      },
      body: 'grant_type=client_credentials'
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch track or playlist info
    const endpoint = type === 'track'
      ? `https://api.spotify.com/v1/tracks/${id}`
      : `https://api.spotify.com/v1/playlists/${id}`;

    const infoResponse = await fetch(endpoint, {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    const info = await infoResponse.json();

    let result = {};

    if (type === 'track') {
      result = {
        type: 'track',
        title: info.name,
        artist: info.artists.map(a => a.name).join(', '),
        id: id
      };
    } else {
      result = {
        type: 'playlist',
        title: info.name,
        owner: info.owner.display_name,
        id: id
      };
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(result)
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Spotify API error', detail: err.message })
    };
  }
};
