// ═══════════════════════════════════════════════════════
// ColdLog — Backend Nuvem Fiscal (Netlify Function)
// Arquivo: netlify/functions/nuvemfiscal.js
//
// Este arquivo fica na pasta netlify/functions/
// e resolve o problema de CORS para chamadas à API
// da Nuvem Fiscal a partir do navegador.
// ═══════════════════════════════════════════════════════

const NF_CLIENT_ID     = process.env.NF_CLIENT_ID     || 'CvTAyv8sByaYDDkW7Ylk';
const NF_CLIENT_SECRET = process.env.NF_CLIENT_SECRET || 'lTHItvGiQH0fklvJ7DWQiPz40uj3bRapv64hiZi0';
const NF_BASE_URL      = process.env.NF_BASE_URL       || 'https://sandbox.api.nuvemfiscal.com.br';

let _token = null;
let _tokenExp = 0;

// Obter token OAuth2
async function getToken() {
  const now = Date.now();
  if (_token && now < _tokenExp) return _token;

  const resp = await fetch(`${NF_BASE_URL}/auth/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${NF_CLIENT_ID}&client_secret=${NF_CLIENT_SECRET}`
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Auth failed: ${resp.status} ${err}`);
  }

  const data = await resp.json();
  _token = data.access_token;
  _tokenExp = now + (data.expires_in - 60) * 1000;
  return _token;
}

// Handler principal
exports.handler = async (event) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    // Pega o path e método da requisição
    // Chamada: POST /.netlify/functions/nuvemfiscal
    // Body: { method, path, body }
    const { method, path, body: reqBody } = JSON.parse(event.body || '{}');

    if (!path) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'path é obrigatório' }) };
    }

    const token = await getToken();

    const fetchOpts = {
      method: method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    };

    if (reqBody && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
      fetchOpts.body = JSON.stringify(reqBody);
    }

    const url = `${NF_BASE_URL}${path}`;
    console.log(`[NuvemFiscal] ${method} ${url}`);

    const resp = await fetch(url, fetchOpts);
    const data = await resp.json().catch(() => ({}));

    return {
      statusCode: resp.status,
      headers,
      body: JSON.stringify(data)
    };

  } catch (err) {
    console.error('[NuvemFiscal Error]', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
