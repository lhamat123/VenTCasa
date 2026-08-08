// ══════════════════════════════════════════════════════════════════
//  LLAVE en Mano — Worker de guardado seguro
// ══════════════════════════════════════════════════════════════════
// Este Worker es el ÚNICO lugar donde vive el token de GitHub. El
// navegador nunca lo ve: solo habla con este Worker, y este habla
// con GitHub usando el token guardado como "secret" en Cloudflare.
//
// Rutas expuestas:
//   POST /login   { password }                 -> { token, expiresIn }
//   PUT  /data    { content, sha? }             -> respuesta de GitHub (requiere sesión)
//   PUT  /image   { path, content }             -> respuesta de GitHub (requiere sesión)
//
// Variables de entorno que debes configurar (ver README.md):
//   Secrets (wrangler secret put ...):
//     GITHUB_TOKEN    -> tu Personal Access Token de GitHub (fine-grained,
//                        permiso "Contents: Read and write" SOLO sobre el repo Vhome)
//     APP_PASS        -> la contraseña del panel admin
//     SESSION_SECRET  -> una cadena aleatoria larga (ej: openssl rand -hex 32)
//   Variable normal (en wrangler.toml, no es secreta):
//     ALLOWED_ORIGIN  -> el dominio desde donde se sirve tu index.html
//                        (ej: https://tuusuario.github.io). Usa "*" si no
//                        quieres restringirlo mientras pruebas.

const GH_USER   = 'lhamat123';
const GH_REPO   = 'VenTCasa';
const GH_BRANCH = 'main';
const GH_FILE   = 'data.json';
const SESSION_TTL = 60 * 60 * 6; // 6 horas

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function jsonResponse(data, status, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

// Firma HMAC-SHA256 en base64url, sin dependencias externas (Web Crypto nativo).
async function hmacSign(key, message) {
  const enc = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Sesión = "<expira_unix>.<firma>" — sin estado, no necesita base de datos.
async function createSession(env) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL;
  const sig = await hmacSign(env.SESSION_SECRET, String(exp));
  return `${exp}.${sig}`;
}

async function verifySession(env, token) {
  if (!token) return false;
  const [expStr, sig] = token.split('.');
  if (!expStr || !sig) return false;
  const expected = await hmacSign(env.SESSION_SECRET, expStr);
  if (expected !== sig) return false;
  const exp = parseInt(expStr, 10);
  return Boolean(exp) && Date.now() / 1000 < exp;
}

async function githubRequest(env, path, body) {
  return fetch(`https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${path}`, {
    method: 'PUT',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'User-Agent': 'llave-en-mano-worker',
    },
    body: JSON.stringify(body),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // ── LOGIN: intercambia la contraseña por una sesión firmada ──
    if (url.pathname === '/login' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!env.APP_PASS || body.password !== env.APP_PASS) {
        return jsonResponse({ error: 'Contraseña incorrecta' }, 401, env);
      }
      const token = await createSession(env);
      return jsonResponse({ token, expiresIn: SESSION_TTL }, 200, env);
    }

    // ── Todo lo demás requiere una sesión válida ──
    const authHeader = request.headers.get('Authorization') || '';
    const sessionToken = authHeader.replace(/^Bearer\s+/i, '');
    if (!(await verifySession(env, sessionToken))) {
      return jsonResponse({ error: 'Sesión inválida o expirada' }, 401, env);
    }

    // ── Guardar data.json ──
    if (url.pathname === '/data' && request.method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      if (!body.content) return jsonResponse({ error: 'Falta content' }, 400, env);
      const ghBody = {
        message: 'Actualizar inmuebles',
        content: body.content,
        branch: GH_BRANCH,
        committer: { name: 'LLAVE en Mano', email: 'noreply@lhavemano.com' },
      };
      if (body.sha) ghBody.sha = body.sha;
      const ghRes = await githubRequest(env, GH_FILE, ghBody);
      const data = await ghRes.json().catch(() => ({}));
      return jsonResponse(data, ghRes.status, env);
    }

    // ── Subir una imagen ──
    if (url.pathname === '/image' && request.method === 'PUT') {
      const body = await request.json().catch(() => ({}));
      if (!body.path || !body.content) {
        return jsonResponse({ error: 'Faltan path o content' }, 400, env);
      }
      // Evita que un path manipulado escape de la carpeta del repo (../../..).
      const safePath = String(body.path).replace(/^\/+/, '').replace(/\.\.+/g, '');
      const encodedPath = encodeURIComponent(safePath).replace(/%2F/g, '/');
      const ghRes = await githubRequest(env, encodedPath, {
        message: 'Subir imagen',
        content: body.content,
        branch: GH_BRANCH,
      });
      const data = await ghRes.json().catch(() => ({}));
      return jsonResponse(data, ghRes.status, env);
    }

    return jsonResponse({ error: 'Ruta no encontrada' }, 404, env);
  },
};
