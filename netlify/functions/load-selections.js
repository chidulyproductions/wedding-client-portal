
const https = require('https');

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
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;

  const clientKey = event.queryStringParameters && event.queryStringParameters.clientKey;

  if (!clientKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing clientKey' }) };
  }

  try {
    const res = await httpsGet(
      `${supabaseUrl}/rest/v1/wedding_selections?client_key=eq.${encodeURIComponent(clientKey)}`,
      {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    );

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: res.body
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
