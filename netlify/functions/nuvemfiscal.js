const https = require('https');

const NF_CLIENT_ID     = process.env.NF_CLIENT_ID     || 'CvTAyv8sByaYDDkW7Ylk';
const NF_CLIENT_SECRET = process.env.NF_CLIENT_SECRET || 'lTHItvGiQH0fklvJ7DWQiPz40uj3bRapv64hiZi0';
const NF_BASE_URL = process.env.NF_BASE_URL || 'https://api.sandbox.nuvemfiscal.com.br';

let _token = null;
let _tokenExp = 0;

// HTTP request using native https module
function httpsRequest(url, options, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ status: res.statusCode, text: data });
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Request timeout')); });

    if (body) req.write(body);
    req.end();
  });
}

async function getToken() {
  const now = Date.now();
  if (_token && now < _tokenExp) return _token;

  const body = `grant_type=client_credentials&scope=nfe+nfse&client_id=${NF_CLIENT_ID}&client_secret=${NF_CLIENT_SECRET}`;
  const result = await httpsRequest(`https://auth.nuvemfiscal.com.br/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, body);

  if (result.status !== 200) {
    throw new Error(`Auth failed: ${result.status} ${result.text}`);
  }

  const data = JSON.parse(result.text);
  _token = data.access_token;
  _tokenExp = now + (data.expires_in - 60) * 1000;
  return _token;
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { method, path, body: reqBody } = JSON.parse(event.body || '{}');

    if (!path) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'path é obrigatório' }) };
    }

    const token = await getToken();
    const url = `${NF_BASE_URL}${path}`;
    console.log(`[NF] ${method} ${url}`);

    const bodyStr = reqBody ? JSON.stringify(reqBody) : null;
    const reqHeaders = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
    if (bodyStr) reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);

    const result = await httpsRequest(url, { method: method || 'GET', headers: reqHeaders }, bodyStr);
    console.log(`[NF] Response ${result.status}: ${result.text.substring(0, 300)}`);

    let data;
    try { data = JSON.parse(result.text); } catch(e) { data = { raw: result.text }; }

    return { statusCode: result.status, headers, body: JSON.stringify(data) };

  } catch (err) {
    console.error('[NF Error]', err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
