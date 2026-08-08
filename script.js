// ══════════════════════════════════════════════════════════════════
//  LLAVE en Mano — lógica de la app
//  Separado de index.html para que sea más fácil de mantener.
//  Sigue siendo un único ámbito global (sin módulos ES) a propósito:
//  los botones del HTML usan onclick="nombreDeFuncion()", así que las
//  funciones deben quedar accesibles como globales. Si en el futuro se
//  quiere dividir en varios archivos, cada uno puede cargarse con
//  <script src="..."> (en orden) sin usar type="module".
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════
//  CONFIGURACIÓN
// ══════════════════════════════════════════════════
const GH_USER   = 'lhamat123';    // ← tu usuario GitHub
const GH_REPO   = 'Vhome';        // ← nombre del repo
const GH_FILE   = 'data.json';
const GH_BRANCH = 'main';         // ← rama donde se guardan los datos
const GH_IMG_DIR= 'images';       // ← carpeta del repo donde se suben las fotos
// El token de GitHub y la contraseña YA NO viven en este archivo. Todo guardado
// (data.json e imágenes) pasa por un Cloudflare Worker que guarda el token del
// lado del servidor — ver /worker/README.md para desplegarlo. Reemplaza esta URL
// por la que te dé `wrangler deploy` (algo como https://tu-worker.tu-cuenta.workers.dev).
const WORKER_URL = 'https://llave-en-mano-api.TU-SUBDOMINIO.workers.dev';
// ══════════════════════════════════════════════════

const AMENITIES_LIST = [
  {key:'garaje',   label:'🚗 Garaje'},
  {key:'jardin',   label:'🌿 Jardín'},
  {key:'piscina',  label:'🏊 Piscina'},
  {key:'barbacoa', label:'🔥 Barbacoa'},
  {key:'cisterna', label:'💧 Cisterna'},
  {key:'placa',    label:'⚡ Placa Solar'},
  {key:'wifi',     label:'📶 WiFi/Cable'},
  {key:'telefono', label:'📞 Teléfono'},
];

const THEME_KEY = 'lhim_theme';
const THEMES = ['cyber','night','light','beige'];

let properties = [], fileSHA = '';
let favOnly = false;
let favorites = (function(){ try { return JSON.parse(localStorage.getItem('lhim_favs')||'[]'); } catch(e){ return []; } })();
let curView = 'grid';
let editId = null;
let curMainImg = '';
let curGalleryImgs = [];
let viewingId = null;
let sessionToken = '', isAuth = false;


// ── FAVORITOS ──
function isFav(id){ return favorites.includes(id); }
function saveFavs(){ try{ localStorage.setItem('lhim_favs', JSON.stringify(favorites)); }catch(e){} updateFavUI(); }
function toggleFav(id){
  const i = favorites.indexOf(id);
  if(i===-1) favorites.push(id); else favorites.splice(i,1);
  saveFavs(); renderProperties();
}
function toggleFavFromDetail(){
  if(!viewingId) return;
  toggleFav(viewingId);
  updateDetailFavBtn();
}
function updateDetailFavBtn(){
  const btn = document.getElementById('detail-fav-btn');
  if(!btn||!viewingId) return;
  btn.innerHTML = isFav(viewingId) ? '&#x2B50;' : '&#x2606;';
  btn.classList.toggle('on', isFav(viewingId));
}
function toggleFavFilter(){
  favOnly = !favOnly;
  const btn = document.getElementById('fav-filter-btn');
  if(btn) btn.classList.toggle('active', favOnly);
  renderProperties();
}
function updateFavUI(){
  const cnt = document.getElementById('fav-count');
  if(cnt) cnt.textContent = favorites.length;
  const btn = document.getElementById('fav-filter-btn');
  if(btn) btn.classList.toggle('active', favOnly);
}

// ── THEME ──
function setTheme(t) {
  if (!THEMES.includes(t)) t = 'cyber';
  t === 'cyber' ? document.documentElement.removeAttribute('data-theme')
                : document.documentElement.setAttribute('data-theme', t);
  THEMES.forEach(x => { const b = document.getElementById('th-'+x); if(b) b.classList.toggle('on', x===t); });
  try { localStorage.setItem(THEME_KEY, t); } catch(e) {}
}
(function(){ try { setTheme(localStorage.getItem(THEME_KEY)||'cyber'); } catch(e) { setTheme('cyber'); } })();

// ── LOADING / TOAST ──
function showLoad(on) {
  const b = document.getElementById('loading-bar');
  b.style.display = on ? 'block' : 'none';
  b.style.width = on ? '70%' : '100%';
  if (!on) setTimeout(() => b.style.width = '0', 400);
}
function toast(msg, type='ok') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'show' + (type==='err' ? ' err' : '');
  clearTimeout(t._t); t._t = setTimeout(() => t.className='', 3200);
}

// ── AUTH ──
function openLogin() {
  document.getElementById('login-pass').value='';
  document.getElementById('login-err').textContent='';
  document.getElementById('login-overlay').classList.add('open');
  setTimeout(() => document.getElementById('login-pass').focus(), 100);
}
function closeLogin() { document.getElementById('login-overlay').classList.remove('open'); }

async function doLogin() {
  const pass  = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-err');
  const btn = document.querySelector('#login-overlay .btn-primary');
  if (!pass) { errEl.textContent = 'Escribe tu contraseña.'; return; }
  try {
    if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
    const res = await fetch(WORKER_URL + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pass })
    });
    const json = await res.json().catch(()=>({}));
    if (!res.ok) { errEl.textContent = json.error || 'Contraseña incorrecta.'; return; }
    sessionToken = json.token; isAuth = true;
    try { sessionStorage.setItem('lhim_session', sessionToken); } catch(e) {}
    closeLogin(); updateAuthUI(); toast('✅ Sesión iniciada');
  } catch(e) {
    errEl.textContent = 'No se pudo conectar con el servidor de guardado.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

function doLogout() {
  isAuth = false; sessionToken = '';
  try { sessionStorage.removeItem('lhim_session'); } catch(e) {}
  updateAuthUI(); toast('Sesión cerrada');
}

function updateAuthUI() {
  document.getElementById('btn-login').style.display  = isAuth ? 'none' : 'flex';
  document.getElementById('btn-logout').style.display = isAuth ? 'flex' : 'none';
  document.getElementById('btn-new').style.display    = isAuth ? 'flex' : 'none';
  const tag = document.getElementById('auth-user-tag');
  tag.style.display = isAuth ? 'inline-flex' : 'none';
  tag.textContent   = isAuth ? '✏️ Editor' : '';
  const delBtn = document.getElementById('detail-delete-btn');
  const editBtn = document.getElementById('detail-edit-btn');
  if (delBtn) delBtn.style.display = (isAuth && viewingId) ? 'flex' : 'none';
  if (editBtn) editBtn.style.display = (isAuth && viewingId) ? 'flex' : 'none';
  renderProperties();
}

(function(){
  try {
    const t = sessionStorage.getItem('lhim_session');
    if (t) {
      const exp = parseInt((t.split('.')[0]||'0'), 10);
      if (exp && Date.now()/1000 < exp) { sessionToken = t; isAuth = true; }
      else sessionStorage.removeItem('lhim_session');
    }
  } catch(e){}
})();

// ── HELPERS DE SEGURIDAD / IMÁGENES ──
// Escapa contenido de usuario antes de inyectarlo en innerHTML (evita XSS).
function esc(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Escapa un valor para usarlo dentro de un atributo HTML (src, href…).
function escAttr(s){ return esc(s); }

// Convierte una referencia de imagen guardada en una URL mostrable.
// - data:URL  → se usa tal cual (compatibilidad hacia atrás)
// - http(s)   → se usa tal cual
// - ruta repo → se sirve por jsDelivr (CDN) para velocidad y escalabilidad
function imgURL(v){
  if(!v) return '';
  if(/^(data:|https?:|blob:)/i.test(v)) return v;
  const path = String(v).replace(/^\/+/,'');
  return `https://cdn.jsdelivr.net/gh/${GH_USER}/${GH_REPO}@${GH_BRANCH}/${path}`;
}

// Codificación UTF-8 ↔ base64 sin las funciones obsoletas escape()/unescape().
function utf8ToB64(str){
  const bytes = new TextEncoder().encode(str);
  let bin = ''; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
function b64ToUtf8(b64){
  const bin = atob(b64.replace(/\s/g,''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// ── GITHUB API ──
const API = `https://api.github.com/repos/${GH_USER}/${GH_REPO}/contents/${GH_FILE}`;

async function loadData() {
  showLoad(true);
  try {
    const res = await fetch(API + '?ref=' + encodeURIComponent(GH_BRANCH), { headers: { 'Accept': 'application/vnd.github+json' } });
    if (!res.ok) throw new Error('status ' + res.status);
    const json = await res.json();
    fileSHA = json.sha;
    const raw = JSON.parse(b64ToUtf8(json.content));
    properties = Array.isArray(raw.properties) ? raw.properties : [];
  } catch(e) {
    properties = []; fileSHA = '';
    console.warn('data.json no encontrado, se creará al guardar.', e.message);
    // Cargar datos de ejemplo para demostración
    loadDemoData();
  }
  showLoad(false);
  renderProperties();
  updateAuthUI();
  handleDeepLink();
}

// Abre automáticamente la propiedad indicada en la URL (?p=ID o #p=ID).
// Esto hace que los QR (que apuntan a ?p=ID) realmente abran el inmueble.
function handleDeepLink() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('p') || ''; } catch(e){}
  if (!id && location.hash.startsWith('#p=')) id = decodeURIComponent(location.hash.slice(3));
  if (id && properties.some(p => p.id === id)) openDetail(id);
}

function loadDemoData() {
  properties = [
  {
    "id": "p1",
    "type": "Casa",
    "name": "Casa Colonial en el Vedado",
    "address": "Calle 17 No.1205 e/ 20 y 22, Vedado, La Habana",
    "price": 85000,
    "docStatus": "Transferible",
    "contactName": "Alain Rodríguez",
    "contactTel": "+5353105037",
    "negotiate": true,
    "surfUtil": 180,
    "surfConst": 210,
    "surfTotal": 300,
    "rooms": 3,
    "baths": 2,
    "comedor": 1,
    "cocina": 1,
    "terraza": 1,
    "portal": 1,
    "description": "Hermosa casa colonial de dos plantas en el corazón del Vedado. Amplios salones, patio interior con jardín, techos altos y excelente ventilación natural.",
    "amenities": [
      "garaje",
      "jardin",
      "cisterna"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p2",
    "type": "Apartamento",
    "name": "Apartamento moderno en Miramar",
    "address": "5ta Avenida e/ 42 y 44, Miramar, Playa, La Habana",
    "price": 42000,
    "docStatus": "En Trámites",
    "contactName": "María González",
    "contactTel": "+5352871234",
    "negotiate": false,
    "surfUtil": 75,
    "surfConst": 80,
    "surfTotal": 80,
    "rooms": 2,
    "baths": 2,
    "comedor": 1,
    "cocina": 1,
    "terraza": 0,
    "portal": 0,
    "description": "Apartamento en planta alta totalmente renovado. Cocina equipada, baño moderno, split de frío/calor. Vista al parque.",
    "amenities": [
      "wifi",
      "placa"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p3",
    "type": "Finca",
    "name": "Finca Recreativa en Artemisa",
    "address": "Carretera de Güira km 14, Artemisa",
    "price": 120000,
    "docStatus": "Transferible",
    "contactName": "Roberto Sánchez",
    "contactTel": "+5355901122",
    "negotiate": true,
    "surfUtil": 500,
    "surfConst": 200,
    "surfTotal": 15000,
    "rooms": 4,
    "baths": 3,
    "comedor": 2,
    "cocina": 2,
    "terraza": 2,
    "portal": 1,
    "description": "Finca de 1.5 hectáreas con casa principal, piscina, barbacoa y árboles frutales. Pozo propio y placa solar.",
    "amenities": [
      "garaje",
      "jardin",
      "piscina",
      "barbacoa",
      "cisterna",
      "placa"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p4",
    "type": "Local",
    "name": "Local Comercial en Obispo",
    "address": "Calle Obispo No.408 e/ Compostela y Aguacate, Habana Vieja",
    "price": 55000,
    "docStatus": "Desactualizado",
    "contactName": "Yanet Pérez",
    "contactTel": "+5354003344",
    "negotiate": true,
    "surfUtil": 60,
    "surfConst": 60,
    "surfTotal": 60,
    "rooms": 0,
    "baths": 2,
    "comedor": 0,
    "cocina": 0,
    "terraza": 0,
    "portal": 1,
    "description": "Local de esquina en la calle más transitada de La Habana Vieja. Apto para tienda, restaurante u oficina.",
    "amenities": [
      "wifi",
      "telefono"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p5",
    "type": "Casa",
    "name": "Casa con Jardín en Siboney",
    "address": "Calle 216 No.3105, Siboney, Playa, La Habana",
    "price": 210000,
    "docStatus": "Transferible",
    "contactName": "Carlos Montoya",
    "contactTel": "+5358771234",
    "negotiate": true,
    "surfUtil": 320,
    "surfConst": 280,
    "surfTotal": 600,
    "rooms": 5,
    "baths": 3,
    "comedor": 2,
    "cocina": 2,
    "terraza": 3,
    "portal": 2,
    "description": "Espectacular residencia en Siboney con jardín amplio, garaje doble y piscina. Acabados de lujo, completamente remodelada.",
    "amenities": [
      "garaje",
      "jardin",
      "piscina",
      "barbacoa",
      "cisterna",
      "placa",
      "wifi",
      "telefono"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p6",
    "type": "Apartamento",
    "name": "Penthouse en Vedado",
    "address": "Calle 23 No.856 e/ 4 y 6, Vedado, La Habana",
    "price": 98000,
    "docStatus": "En Trámites",
    "contactName": "Lidia Fuentes",
    "contactTel": "+5353440099",
    "negotiate": false,
    "surfUtil": 130,
    "surfConst": 140,
    "surfTotal": 140,
    "rooms": 3,
    "baths": 2,
    "comedor": 1,
    "cocina": 1,
    "terraza": 2,
    "portal": 0,
    "description": "Penthouse con vista panorámica al mar. Terraza privada, cocina moderna integrada y dos habitaciones en suite.",
    "amenities": [
      "placa",
      "wifi",
      "telefono"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p7",
    "type": "Casa",
    "name": "Casa en Lawton",
    "address": "Calle Dolores No.512, Lawton, 10 de Octubre, La Habana",
    "price": 28000,
    "docStatus": "Sin Documento",
    "contactName": "Ernesto Vidal",
    "contactTel": "+5352119988",
    "negotiate": true,
    "surfUtil": 90,
    "surfConst": 110,
    "surfTotal": 150,
    "rooms": 3,
    "baths": 2,
    "comedor": 1,
    "cocina": 1,
    "terraza": 0,
    "portal": 1,
    "description": "Casa de mampostería en buen estado. Patio trasero amplio con posibilidad de ampliación. Cerca de comercios y transporte.",
    "amenities": [
      "cisterna",
      "telefono"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p8",
    "type": "Local",
    "name": "Cafetería en Habana del Este",
    "address": "Ave. 1ra No.4412, Habana del Este, La Habana",
    "price": 18500,
    "docStatus": "Transferible",
    "contactName": "Miriam Castillo",
    "contactTel": "+5355623311",
    "negotiate": true,
    "surfUtil": 45,
    "surfConst": 45,
    "surfTotal": 45,
    "rooms": 0,
    "baths": 2,
    "comedor": 2,
    "cocina": 2,
    "terraza": 0,
    "portal": 1,
    "description": "Local acondicionado como cafetería con barra, cocina equipada y licencia de operación. Zona de alto tránsito.",
    "amenities": [
      "wifi",
      "telefono",
      "cisterna"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p9",
    "type": "Finca",
    "name": "Finca Ganadera en Pinar del Río",
    "address": "Km 22 Carretera de Viñales, Pinar del Río",
    "price": 175000,
    "docStatus": "Desactualizado",
    "contactName": "Ángel Reyes",
    "contactTel": "+5358002277",
    "negotiate": true,
    "surfUtil": 800,
    "surfConst": 350,
    "surfTotal": 50000,
    "rooms": 4,
    "baths": 2,
    "comedor": 2,
    "cocina": 2,
    "terraza": 2,
    "portal": 2,
    "description": "Finca con 5 hectáreas, casa principal remodelada, casa de aperos, pozo artesiano y río en el lindero.",
    "amenities": [
      "garaje",
      "jardin",
      "cisterna",
      "placa",
      "barbacoa"
    ],
    "mainImage": "",
    "gallery": []
  },
  {
    "id": "p10",
    "type": "Apartamento",
    "name": "Apartamento en Nuevo Vedado",
    "address": "Calle 26 No.360 e/ 35 y 37, Nuevo Vedado, Plaza, La Habana",
    "price": 36000,
    "docStatus": "Transferible",
    "contactName": "Sonia Herrera",
    "contactTel": "+5354887755",
    "negotiate": false,
    "surfUtil": 65,
    "surfConst": 70,
    "surfTotal": 70,
    "rooms": 2,
    "baths": 2,
    "comedor": 1,
    "cocina": 1,
    "terraza": 0,
    "portal": 0,
    "description": "Apartamento en primer piso con acceso fácil. Remodelado totalmente, ventanas de aluminio y rejas de seguridad.",
    "amenities": [
      "cisterna",
      "wifi",
      "telefono"
    ],
    "mainImage": "",
    "gallery": []
  }
];
}

// Sube UNA imagen data:URL al repo como archivo y devuelve su ruta relativa.
// Devuelve null si no es una data:URL (ya es ruta/URL) o si algo falla.
async function uploadImageFile(dataUrl, idHint){
  if (!dataUrl || !/^data:image\//i.test(dataUrl)) return null;
  const m = dataUrl.match(/^data:image\/([a-z0-9.+-]+);base64,(.*)$/i);
  if (!m) return null;
  const ext = (m[1] === 'jpeg' ? 'jpg' : m[1]).toLowerCase();
  const b64 = m[2];
  const safeHint = String(idHint||'img').replace(/[^a-z0-9_-]/gi,'').slice(0,24) || 'img';
  const path = `${GH_IMG_DIR}/${safeHint}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}.${ext}`;
  const res = await fetch(WORKER_URL + '/image', {
    method: 'PUT',
    headers: { 'Content-Type':'application/json', 'Authorization': `Bearer ${sessionToken}` },
    body: JSON.stringify({ path, content: b64 })
  });
  if (!res.ok) throw new Error('img ' + res.status);
  return path;
}

// Recorre las propiedades y convierte todas las imágenes en base64 a archivos.
// Si la subida de alguna falla, se conserva la data:URL en línea (no se pierde
// nada: en el peor caso se comporta como la versión anterior).
async function migrateInlineImages(){
  let movedAny = false, failed = false;
  for (const p of properties){
    if (/^data:image\//i.test(p.mainImage||'')) {
      try { const path = await uploadImageFile(p.mainImage, p.id); if (path){ p.mainImage = path; movedAny = true; } }
      catch(e){ failed = true; console.warn('No se pudo subir foto principal', e.message); }
    }
    if (Array.isArray(p.gallery)) {
      for (let i=0;i<p.gallery.length;i++){
        if (/^data:image\//i.test(p.gallery[i]||'')) {
          try { const path = await uploadImageFile(p.gallery[i], p.id+'-g'+i); if (path){ p.gallery[i] = path; movedAny = true; } }
          catch(e){ failed = true; console.warn('No se pudo subir foto de galería', e.message); }
        }
      }
    }
  }
  return { movedAny, failed };
}

async function saveData() {
  if (!sessionToken) { toast('Inicia sesión para guardar', 'err'); return false; }
  showLoad(true);
  try {
    // 1) Mover imágenes en línea a archivos (mantiene data.json pequeño y rápido)
    const imgRes = await migrateInlineImages();
    if (imgRes.failed) toast('⚠️ Alguna foto no se pudo subir; se guardó incrustada', 'err');

    // 2) Guardar data.json con reintento si hay conflicto de edición (409/422 por SHA)
    const ok = await putDataJson();
    showLoad(false);
    return ok;
  } catch(e) {
    showLoad(false);
    toast('Error al guardar: ' + e.message, 'err');
    return false;
  }
}

async function putDataJson(attempt) {
  attempt = attempt || 0;
  const content = utf8ToB64(JSON.stringify({ properties }, null, 2));
  const body = { content };
  if (fileSHA) body.sha = fileSHA;
  const res = await fetch(WORKER_URL + '/data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${sessionToken}` },
    body: JSON.stringify(body)
  });
  if (res.ok) {
    const json = await res.json();
    fileSHA = json.content.sha;
    return true;
  }
  if (res.status === 401) { doLogout(); throw new Error('sesión expirada, vuelve a entrar'); }
  // Conflicto: otra persona guardó antes. Refrescamos el SHA y reintentamos una vez.
  if ((res.status === 409 || res.status === 422) && attempt < 1) {
    try {
      const cur = await fetch(API + '?ref=' + encodeURIComponent(GH_BRANCH), { headers: { 'Accept':'application/vnd.github+json' } });
      if (cur.ok) { fileSHA = (await cur.json()).sha; return await putDataJson(attempt + 1); }
    } catch(e){}
    throw new Error('conflicto de edición: recarga la página');
  }
  let msg = res.status;
  try { msg = (await res.json()).message || msg; } catch(e){}
  throw new Error(msg);
}

// ── HELPERS ──
function docClass(d){
  const m = {'Transferible':'transferible','Sin Documento':'sindoc','En Trámites':'tramites','Desactualizado':'desactualizado'};
  return m[d]||'sindoc';
}
function docEmoji(d){
  const m = {'Transferible':'✅','Sin Documento':'❌','En Trámites':'⏳','Desactualizado':'⚠️'};
  return m[d]||'❓';
}
function docBadgeHTML(d){
  if(!d) return '';
  return `<span class="doc-badge doc-${docClass(d)}">${docEmoji(d)} ${d}</span>`;
}
function fmtPrice(n) {
  if (!n) return '—';
  return '$ ' + Number(n).toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
}
function mapsUrl(addr) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr||'');
}
function typeClass(t) {
  const m = {Casa:'casa',Apartamento:'apartamento',Finca:'finca',Local:'local'};
  return m[t] || 'casa';
}
function typeEmoji(t) {
  const m = {Casa:'🏡',Apartamento:'🏢',Finca:'🌾',Local:'🏪'};
  return m[t] || '🏠';
}

// ── RENDER ──
function getFiltered() {
  const q  = document.getElementById('search-input').value.toLowerCase();
  const tp = document.getElementById('type-filter').value;
  const pr = document.getElementById('price-filter').value;
  const so = document.getElementById('sort-filter').value;
  let list = properties.filter(p => {
    if (tp && p.type !== tp) return false;
    if (pr) {
      const [mn,mx] = pr.split('-').map(Number);
      if (p.price < mn || p.price > mx) return false;
    }
    for(const [key,f] of Object.entries(advFilters)){
      const v = p[key]||0;
      if(f.dir==='gte' && v < f.val) return false;
      if(f.dir==='lte' && v > f.val) return false;
    }
    if (favOnly && !isFav(p.id)) return false;
    if (comFilters.size > 0) {
      for(const k of comFilters){ if(!(p.amenities||[]).includes(k)) return false; }
    }
    if (docFilters.size > 0 && !docFilters.has(p.docStatus||'')) return false;
    if (q && !p.name.toLowerCase().includes(q) && !(p.address||'').toLowerCase().includes(q) && !(p.description||'').toLowerCase().includes(q)) return false;
    return true;
  });
  if (so === 'price-desc') list.sort((a,b) => (b.price||0)-(a.price||0));
  else if (so === 'price-asc') list.sort((a,b) => (a.price||0)-(b.price||0));
  else if (so === 'rooms-desc') list.sort((a,b) => (b.rooms||0)-(a.rooms||0));
  else if (so === 'rooms-asc') list.sort((a,b) => (a.rooms||0)-(b.rooms||0));
  else if (so === 'surf-desc') list.sort((a,b) => (b.surfConst||0)-(a.surfConst||0));
  else if (so === 'surf-asc') list.sort((a,b) => (a.surfConst||0)-(b.surfConst||0));
  return list;
}

// ── PAGINACIÓN ──
const PAGE_SIZE = 12;
let currentPage = 1;
let _lastFilterKey = '';

// Firma del estado de filtros/búsqueda/orden actual. Si cambia respecto
// al último render, se vuelve a la página 1 (no tiene sentido quedarse
// en la página 5 de un filtro distinto al que la generó).
function _filterKey() {
  return JSON.stringify({
    q:  document.getElementById('search-input').value,
    tp: document.getElementById('type-filter').value,
    pr: document.getElementById('price-filter').value,
    so: document.getElementById('sort-filter').value,
    adv: advFilters,
    fav: favOnly,
    com: [...comFilters],
    doc: [...docFilters]
  });
}

function goToPage(p, totalPages) {
  currentPage = Math.min(Math.max(1, p), totalPages || 1);
  renderProperties();
  const area = document.getElementById('content-area');
  if (area) area.scrollTop = 0;
}

// Genera los números de página a mostrar, con "…" cuando hay muchas.
function _pageNumbers(current, total) {
  const nums = new Set([1, total, current, current - 1, current + 1]);
  return [...nums].filter(n => n >= 1 && n <= total).sort((a,b) => a-b);
}

function paginationHTML(totalItems, totalPages) {
  if (totalPages <= 1) return '';
  const nums = _pageNumbers(currentPage, totalPages);
  let btns = '';
  let prev = 0;
  for (const n of nums) {
    if (prev && n - prev > 1) btns += `<span class="page-ellipsis">…</span>`;
    btns += `<button class="page-btn${n===currentPage?' active':''}" onclick="goToPage(${n},${totalPages})" ${n===currentPage?'aria-current="page"':''}>${n}</button>`;
    prev = n;
  }
  return `
    <div class="pagination-bar">
      <button class="page-btn" onclick="goToPage(${currentPage-1},${totalPages})" ${currentPage<=1?'disabled':''} title="Anterior" aria-label="Página anterior">‹</button>
      ${btns}
      <button class="page-btn" onclick="goToPage(${currentPage+1},${totalPages})" ${currentPage>=totalPages?'disabled':''} title="Siguiente" aria-label="Página siguiente">›</button>
      <span class="page-info">${totalItems} propiedad${totalItems===1?'':'es'}</span>
    </div>`;
}

function renderProperties() {
  const area = document.getElementById('content-area');
  const list = getFiltered();

  const key = _filterKey();
  if (key !== _lastFilterKey) { currentPage = 1; _lastFilterKey = key; }

  document.getElementById('total-count').textContent = properties.length + ' propiedad' + (properties.length===1?'':'es');
  if (!list.length) {
    _stopAllCardSlideshows();
    area.innerHTML = `<div class="empty-state"><div class="empty-icon">🏠</div><div class="empty-text">Sin propiedades</div><div style="font-size:12px;margin-top:4px">Agrega una propiedad o ajusta los filtros</div></div>`;
    return;
  }

  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageList = list.slice(start, start + PAGE_SIZE);
  const pager = paginationHTML(list.length, totalPages);

  if (curView === 'grid') {
    area.innerHTML = `<div class="properties-grid">${pageList.map(cardHTML).join('')}</div>${pager}`;
    _stopAllCardSlideshows();
    pageList.forEach(p => _startCardSlideshow(p));
  } else {
    _stopAllCardSlideshows();
    area.innerHTML = `
      <div class="list-header">
        <div></div><div>Propiedad</div><div>Tipo</div><div style="text-align:right">Precio</div><div>Contacto</div><div></div>
      </div>
      <div class="properties-list">${pageList.map(rowHTML).join('')}</div>${pager}`;
  }
}

// ── SLIDESHOW DE TARJETAS (principal + galería, 3s + tiempo aleatorio) ──
const _cardSlideTimers = {};
const _csReduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function _csWait(ms){ return new Promise(r=>setTimeout(r,ms)); }
function _stopAllCardSlideshows(){
  Object.keys(_cardSlideTimers).forEach(id=>{ clearTimeout(_cardSlideTimers[id]); delete _cardSlideTimers[id]; });
}
function _startCardSlideshow(p){
  if (_csReduceMotion) return; // respeta usuarios que prefieren menos movimiento
  const imgs = [p.mainImage, ...(p.gallery||[])].filter(Boolean).map(imgURL);
  if (imgs.length < 2) return;
  const A = document.getElementById(`cs-${p.id}-A`);
  const B = document.getElementById(`cs-${p.id}-B`);
  if (!A || !B) return;

  let cursor = 0;
  let front = A, back = B;
  const FLASH = 300; // ms por imagen rápida
  function nextDelay(){ return 3000 + (Math.random()*3000 - 1500); } // 1.5s–4.5s

  async function cycle(){
    if (!document.getElementById(`cs-${p.id}-A`)) return; // tarjeta ya no está en pantalla
    const total = imgs.length;
    const i1 = (cursor+1)%total, i2 = (cursor+2)%total, i3 = (cursor+3)%total;

    back.src = imgs[i1]; back.style.transition='opacity .05s'; back.style.opacity='1'; front.style.opacity='0';
    await _csWait(FLASH);
    [front,back] = [back,front];
    back.src = imgs[i2]; back.style.transition='opacity .05s'; back.style.opacity='1'; front.style.opacity='0';
    await _csWait(FLASH);
    [front,back] = [back,front];
    back.src = imgs[i3]; back.style.transition='opacity .25s ease-in-out'; back.style.opacity='1';
    await _csWait(280);
    front.style.opacity='0';
    [front,back] = [back,front];

    cursor = i3;
    _cardSlideTimers[p.id] = setTimeout(cycle, nextDelay());
  }
  _cardSlideTimers[p.id] = setTimeout(cycle, nextDelay());
}

function cardHTML(p) {
  const amen = (p.amenities||[]).map(k => {
    const a = AMENITIES_LIST.find(x=>x.key===k);
    return a ? `<span class="amenity-tag">${a.label}</span>` : '';
  }).join('');
  const editBtn = isAuth ? `<button class="icon-btn" onclick="event.stopPropagation();startEdit('${p.id}')" title="Editar" aria-label="Editar propiedad">✏️</button>` : '';
  const telDigits = (p.contactTel||'').replace(/\D/g,'');
  const cimgs = [p.mainImage, ...(p.gallery||[])].filter(Boolean).map(imgURL);
  let cover;
  if (cimgs.length === 0) {
    cover = `<div class="no-img">${typeEmoji(p.type)}</div>`;
  } else if (cimgs.length === 1) {
    cover = `<img src="${escAttr(cimgs[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">`;
  } else {
    cover = `<img class="cs-layer" id="cs-${p.id}-A" src="${escAttr(cimgs[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async" style="opacity:1">
      <img class="cs-layer" id="cs-${p.id}-B" src="" alt="" decoding="async" style="opacity:0">`;
  }
  return `
  <div class="prop-card" onclick="openDetail('${p.id}')">
    <div class="card-image">
      ${cover}
      <div style="position:absolute;top:10px;left:10px;display:flex;gap:5px;align-items:center;flex-wrap:wrap"><span class="card-type-badge type-${typeClass(p.type)}" style="position:relative;top:auto;left:auto">${esc(p.type)}</span>${p.docStatus ? `<span class="doc-badge doc-${docClass(p.docStatus)}" style="backdrop-filter:blur(8px);background:rgba(0,0,0,0.45)">${docEmoji(p.docStatus)} ${esc(p.docStatus)}</span>` : ''}</div>
      <button class="card-fav-btn ${isFav(p.id)?'on':''}" onclick="event.stopPropagation();toggleFav('${p.id}')" title="${isFav(p.id)?'Quitar de favoritos':'Agregar a favoritos'}" aria-label="${isFav(p.id)?'Quitar de favoritos':'Agregar a favoritos'}">
        <i class="star-off">&#x2606;</i><i class="star-on">&#x2605;</i>
      </button>
    </div>
    <div class="card-body">
      <div class="card-price-row">
        <div class="card-price">${fmtPrice(p.price)}</div>
      </div>
      <div class="card-name">${esc(p.name)}</div>
      <div class="card-addr">📍 ${esc(p.address)||'—'}</div>
      <div class="card-surfaces">
        ${p.rooms?`<div class="surf-item">&#x1F6CC; <span>${p.rooms} dorm.</span></div>`:''}
        ${p.baths?`<div class="surf-item">&#x1F6BF; <span>${p.baths} baños</span></div>`:''}
        ${p.comedor?`<div class="surf-item">&#x1F37D; <span>${p.comedor} comedor</span></div>`:''}
        ${p.cocina?`<div class="surf-item">&#x1F373; <span>${p.cocina} cocina</span></div>`:''}
        ${p.terraza?`<div class="surf-item">&#x2600; <span>${p.terraza} terraza</span></div>`:''}
        ${p.portal?`<div class="surf-item">&#x1F6AA; <span>${p.portal} portal</span></div>`:''}
        ${p.surfUtil?`<div class="surf-item">Útil: <span>${p.surfUtil} m²</span></div>`:''}
        ${p.surfConst?`<div class="surf-item">Const: <span>${p.surfConst} m²</span></div>`:''}
        ${p.surfTotal?`<div class="surf-item">Total: <span>${p.surfTotal} m²</span></div>`:''}
      </div>
      ${amen ? `<div class="card-amenities">${amen}</div>` : ''}
      <div class="card-footer">
        <div class="card-contact-name">${esc(p.contactName)||''}</div>
        <div class="card-action-btns">
          ${p.address ? `<a class="card-act-btn card-act-maps" href="${escAttr(mapsUrl(p.address))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Ver en Google Maps" aria-label="Ver en Google Maps">🗺</a>` : ''}
          ${telDigits ? `<a class="card-act-btn card-act-wa" href="https://wa.me/${telDigits}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Contactar por WhatsApp" aria-label="Contactar por WhatsApp">💬</a>` : ''}
          <button class="card-act-btn card-act-qr" onclick="event.stopPropagation();cardQR('${p.id}')" title="Ver QR" aria-label="Ver código QR">🔲</button>
          ${editBtn}
        </div>
      </div>
    </div>
  </div>`;
}

function rowHTML(p) {
  const editBtn = isAuth ? `<button class="icon-btn" onclick="event.stopPropagation();startEdit('${p.id}')" title="Editar" aria-label="Editar propiedad">✏️</button>` : ``;
  return `
  <div class="prop-row" onclick="openDetail('${p.id}')">
    <div class="row-img">${p.mainImage ? `<img src="${escAttr(imgURL(p.mainImage))}" alt="" loading="lazy" decoding="async">` : typeEmoji(p.type)}</div>
    <div><div class="row-name">${esc(p.name)}</div><div class="row-addr">${esc(p.address)||'—'}</div></div>
    <div class="row-type"><span class="card-type-badge type-${typeClass(p.type)}">${esc(p.type)}</span></div>
    <div class="row-price">${fmtPrice(p.price)}</div>
    <div class="row-contact">${esc(p.contactName)||'—'}<br>${esc(p.contactTel)||''}</div>
    <div style="display:flex;align-items:center;gap:4px"><button class="fav-btn ${isFav(p.id)?'on':''}" onclick="event.stopPropagation();toggleFav('${p.id}')" title="Favorito" aria-label="Favorito">${isFav(p.id)?'&#x2B50;':'&#x2606;'}</button>${editBtn}</div>
  </div>`;
}

function setView(v) {
  curView = v;
  ['grid','list'].forEach(x => {
    document.getElementById(x+'-btn').classList.toggle('active', x===v);
  });
  renderProperties();
}

// ── DETAIL MODAL ──
function openDetail(id) {
  const p = properties.find(x=>x.id===id);
  if (!p) return;
  viewingId = id;
  document.getElementById('detail-title').textContent = p.name;
  const delBtn = document.getElementById('detail-delete-btn');
  const editBtn = document.getElementById('detail-edit-btn');
  delBtn.style.display = isAuth ? 'flex' : 'none';
  editBtn.style.display = isAuth ? 'flex' : 'none';

  const amen = (p.amenities||[]).map(k => {
    const a = AMENITIES_LIST.find(x=>x.key===k);
    return a ? `<div class="amenity-bubble"><span class="check">✓</span>${a.label}</div>` : '';
  }).join('');

  const allImages = [...(p.mainImage ? [p.mainImage] : []), ...(p.gallery||[])].map(imgURL);
  const telDigits = (p.contactTel||'').replace(/\D/g,'');

  document.getElementById('detail-body').innerHTML = `
    ${allImages.length > 0 ? `
    <div class="img-viewer" id="iv-wrap">
      <div class="img-viewer-main" id="iv-main" onclick="ivToggleZoom(event)">
        <img id="iv-img" src="${escAttr(allImages[0])}" alt="${esc(p.name)}">
        <div class="img-viewer-badges">
          <span class="card-type-badge type-${typeClass(p.type)}" style="position:relative;top:auto;left:auto;font-size:10px;padding:4px 11px">${typeEmoji(p.type)} ${esc(p.type)}</span>
          ${p.docStatus ? `<span class="doc-badge doc-${docClass(p.docStatus)}" style="backdrop-filter:blur(8px)">${docEmoji(p.docStatus)} ${esc(p.docStatus)}</span>` : ''}
        </div>
        <button class="img-viewer-nav img-viewer-prev" id="iv-prev" onclick="event.stopPropagation();ivNav(-1)" title="Anterior">&#8249;</button>
        <button class="img-viewer-nav img-viewer-next" id="iv-next" onclick="event.stopPropagation();ivNav(1)" title="Siguiente">&#8250;</button>
        <div class="img-viewer-actions">
          <button class="img-viewer-zoom-btn" id="iv-zoom-btn" onclick="event.stopPropagation();ivToggleZoom(event,true)" title="Zoom 2x">🔍</button>
          ${p.address ? `<a class="img-viewer-zoom-btn" href="${escAttr(mapsUrl(p.address))}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="Google Maps" style="text-decoration:none">🗺</a>` : ''}
          ${telDigits ? `<a class="img-viewer-zoom-btn detail-act-wa" href="https://wa.me/${telDigits}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="WhatsApp" style="text-decoration:none;background:rgba(0,120,60,.7)">💬</a>` : ''}
          <button class="img-viewer-zoom-btn detail-act-qr" onclick="event.stopPropagation();showPropertyQR()" title="Ver QR" style="background:rgba(0,80,100,.7)">🔲</button>
        </div>
        ${allImages.length > 1 ? `<div class="img-viewer-counter" id="iv-counter">1 / ${allImages.length}</div>` : ''}
      </div>
      ${allImages.length > 1 ? `
      <div class="img-viewer-strip" id="iv-strip">
        ${allImages.map((img,i) => `<div class="img-viewer-thumb${i===0?' active':''}" id="iv-thumb-${i}" onclick="ivGoTo(${i})"><img src="${escAttr(img)}" alt="Foto ${i+1}" loading="lazy"></div>`).join('')}
      </div>` : ''}
    </div>
    <script type="application/json" id="lbdata-${p.id}">${JSON.stringify(allImages)}<\/script>
    ` : `<div style="width:100%;height:180px;border-radius:12px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:64px;opacity:.2;margin-bottom:16px">${typeEmoji(p.type)}</div>`}

    <div class="detail-top-row" style="margin-top:14px">
      <div class="detail-top-left">
        <div class="detail-price-inline">
          <span class="detail-price" style="margin-bottom:0">${fmtPrice(p.price)}</span>
        </div>
      </div>
    </div>
    <div class="detail-addr">📍 ${esc(p.address)||'—'}</div>

    ${(p.rooms||p.baths||p.comedor||p.cocina||p.terraza||p.portal||p.surfUtil||p.surfConst||p.surfTotal) ? `
    <div class="detail-section-title">Características</div>
    <div class="feat-chips">
      ${p.rooms    ? `<div class="feat-chip">🛏 <span>${p.rooms} dorm.</span></div>` : ''}
      ${p.baths    ? `<div class="feat-chip">🛁 <span>${p.baths} baños</span></div>` : ''}
      ${p.comedor  ? `<div class="feat-chip">🍽 <span>${p.comedor} comedor</span></div>` : ''}
      ${p.cocina   ? `<div class="feat-chip">🍳 <span>${p.cocina} cocina</span></div>` : ''}
      ${p.terraza  ? `<div class="feat-chip">☀️ <span>${p.terraza} terraza</span></div>` : ''}
      ${p.portal   ? `<div class="feat-chip">🚪 <span>${p.portal} portal</span></div>` : ''}
      ${p.surfUtil  ? `<div class="feat-chip">📐 <span>${p.surfUtil} m² útil</span></div>` : ''}
      ${p.surfConst ? `<div class="feat-chip">🏗 <span>${p.surfConst} m² const.</span></div>` : ''}
      ${p.surfTotal ? `<div class="feat-chip">📏 <span>${p.surfTotal} m² total</span></div>` : ''}
    </div>` : ''}

    ${amen ? `<div class="detail-section-title">Particularidades</div><div class="amenities-bubbles">${amen}</div>` : ''}

    ${p.description ? `<div class="detail-section-title">Descripción</div><div class="detail-desc">${esc(p.description).replace(/\n/g,'<br>')}</div>` : ''}

    <div class="detail-contact-box">
      <div class="detail-contact-title">Contacto directo</div>
      <div class="detail-contact-name">${esc(p.contactName)||'—'}</div>
      <div class="detail-contact-tel">Tel: ${esc(p.contactTel)||'—'}</div>
      ${p.negotiate ? '<div class="detail-contact-neg">✅ Dispuesto a negociar · se escuchan proposiciones</div>' : '<div style="font-size:11px;color:var(--yellow);margin-top:4px">💰 Precio fijo</div>'}
      ${telDigits ? `<a class="whatsapp-btn" href="https://wa.me/${telDigits}" target="_blank" rel="noopener">💬 Contactar por WhatsApp</a>` : ''}
    </div>
  `;

  document.getElementById('detail-overlay').classList.add('open');
  updateDetailFavBtn();
  if (allImages.length > 0) ivInit(allImages);
}

function closeDetail() {
  document.getElementById('detail-overlay').classList.remove('open');
  viewingId = null;
}

function editCurrent() { if (viewingId) { const id = viewingId; closeDetail(); startEdit(id); } }

function deleteProperty() {
  const p = properties.find(x=>x.id===viewingId);
  if (!p) return;
  document.getElementById('confirm-title').textContent = 'Eliminar propiedad';
  document.getElementById('confirm-msg').textContent = `¿Seguro que deseas eliminar "${p.name}"? Esta acción no se puede deshacer.`;
  document.getElementById('confirm-ok').onclick = async () => {
    const snapshot = properties.slice();
    properties = properties.filter(x=>x.id!==viewingId);
    const ok = await saveData();
    if (ok) { toast('🗑 Propiedad eliminada'); closeConfirm(); closeDetail(); renderProperties(); }
    else { properties = snapshot; renderProperties(); }
  };
  document.getElementById('confirm-overlay').classList.add('open');
}

function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }

// ── LIGHTBOX ──
let _lbImages = [];
let _lbIndex  = 0;

function openLightbox(src, allImages) {
  _lbImages = allImages || [src];
  _lbIndex  = _lbImages.indexOf(src);
  if (_lbIndex < 0) _lbIndex = 0;
  _lbShow();
  document.getElementById('lightbox').classList.add('open');
  document.addEventListener('keydown', _lbKey);
}

function _lbShow() {
  const img = document.getElementById('lightbox-img');
  img.style.opacity = '0';
  img.src = _lbImages[_lbIndex];
  img.onload = () => { img.style.opacity = '1'; };
  // counter
  const c = document.getElementById('lightbox-counter');
  if (_lbImages.length > 1) {
    c.textContent = (_lbIndex + 1) + ' / ' + _lbImages.length;
    c.style.display = 'block';
  } else {
    c.style.display = 'none';
  }
  // nav buttons
  document.querySelector('.lightbox-prev').disabled = (_lbIndex === 0);
  document.querySelector('.lightbox-next').disabled = (_lbIndex === _lbImages.length - 1);
}

function lightboxNav(dir) {
  const next = _lbIndex + dir;
  if (next < 0 || next >= _lbImages.length) return;
  _lbIndex = next;
  _lbShow();
}

function _lbKey(e) {
  if (e.key === 'ArrowLeft')  lightboxNav(-1);
  if (e.key === 'ArrowRight') lightboxNav(1);
  if (e.key === 'Escape')     closeLightbox();
}

function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.removeEventListener('keydown', _lbKey);
}

// ── INLINE IMAGE VIEWER (detail modal) ──
let _ivImages = [];
let _ivIndex  = 0;
let _ivZoomed = false;

function ivInit(images) {
  _ivImages = images;
  _ivIndex  = 0;
  _ivZoomed = false;
  _ivRefresh();
}

function ivGoTo(idx) {
  if (idx < 0 || idx >= _ivImages.length) return;
  if (_ivZoomed) { _ivSetZoom(false); }
  _ivIndex = idx;
  _ivRefresh();
}

function ivNav(dir) {
  ivGoTo(_ivIndex + dir);
}

function _ivRefresh() {
  const img  = document.getElementById('iv-img');
  const prev = document.getElementById('iv-prev');
  const next = document.getElementById('iv-next');
  const ctr  = document.getElementById('iv-counter');
  if (!img) return;
  // reset zoom state cleanly on the image itself
  img.style.transform = 'scale(1)';
  img.style.transformOrigin = '50% 50%';
  img.style.opacity = '0';
  img.src = _ivImages[_ivIndex];
  img.onload = () => { img.style.opacity = '1'; };
  if (prev) prev.disabled = (_ivIndex === 0);
  if (next) next.disabled = (_ivIndex === _ivImages.length - 1);
  if (ctr)  ctr.textContent = (_ivIndex + 1) + ' / ' + _ivImages.length;
  // scroll active thumb within the strip only — not the page
  const strip = document.getElementById('iv-strip');
  if (strip) {
    const thumb = document.getElementById('iv-thumb-' + _ivIndex);
    if (thumb) {
      const sl = thumb.offsetLeft - strip.offsetWidth / 2 + thumb.offsetWidth / 2;
      strip.scrollTo({ left: sl, behavior: 'smooth' });
    }
  }
  // update active class on thumbnails
  document.querySelectorAll('.img-viewer-thumb').forEach((t,i) => {
    t.classList.toggle('active', i === _ivIndex);
  });
}

function ivToggleZoom(e, fromBtn) {
  const main = document.getElementById('iv-main');
  const img  = document.getElementById('iv-img');
  if (!main || !img) return;
  if (!_ivZoomed) {
    const r  = main.getBoundingClientRect();
    const ox = fromBtn ? 50 : Math.round(((e.clientX - r.left) / r.width) * 100);
    const oy = fromBtn ? 50 : Math.round(((e.clientY - r.top)  / r.height) * 100);
    img.style.transformOrigin = ox + '% ' + oy + '%';
    _ivSetZoom(true);
  } else {
    img.style.transformOrigin = '50% 50%';
    _ivSetZoom(false);
  }
}

function _ivSetZoom(on) {
  _ivZoomed = on;
  const main = document.getElementById('iv-main');
  const img  = document.getElementById('iv-img');
  const btn  = document.getElementById('iv-zoom-btn');
  if (main) main.classList.toggle('zoomed', on);
  if (img)  img.style.transform = on ? 'scale(2)' : 'scale(1)';
  if (btn)  { btn.title = on ? 'Salir del zoom' : 'Zoom 2x'; btn.textContent = on ? '🔎' : '🔍'; }
}

// ── FORM MODAL ──
// ── ROOMS / BATHS SELECTOR ──
const RB_OPTIONS = [
  { key:'rooms',   label:'&#x1F6CC; Dormitorios',      icon:'&#x1F6CC;', max:10 },
  { key:'baths',   label:'&#x1F6BF; Serv. sanitarios', icon:'&#x1F6BF;', max:6  },
  { key:'comedor', label:'&#x1F37D; Comedor',           icon:'&#x1F37D;', max:3  },
  { key:'cocina',  label:'&#x1F373; Cocina/Pantry',     icon:'&#x1F373;', max:3  },
  { key:'terraza', label:'&#x2600;&#xFE0F; Terraza',    icon:'&#x2600;&#xFE0F;', max:3 },
  { key:'portal',  label:'&#x1F6AA; Portal',            icon:'&#x1F6AA;', max:3  },
];
let rbState = { rooms:0, baths:0, comedor:0, cocina:0, terraza:0, portal:0 };

function buildRoomBathSelector(init={}){
  rbState = { rooms:0, baths:0, comedor:0, cocina:0, terraza:0, portal:0, ...init };
  const c = document.getElementById('rb-selector');
  if(!c) return;
  c.innerHTML = RB_OPTIONS.map(opt => {
    const sel = rbState[opt.key] > 0;
    const qty = rbState[opt.key];
    return `<div class="rb-bubble" id="rb-bubble-${opt.key}">
      <div class="rb-chip ${sel?'selected':''}" onclick="toggleRbChip('${opt.key}',event)" title="${sel?'Clic para desmarcar':''}">
        ${opt.label}${sel?`<span class="rb-qty">${qty}</span>`:''}
      </div>
      <div class="rb-dropdown ${sel?'open':''}" id="rb-dd-${opt.key}">
        ${Array.from({length:opt.max-1},(_,i)=>i+2).map(n=>`<div class="rb-qty-opt ${qty===n?'active':''}" onclick="selectRbQty('${opt.key}',${n},event)">${n} ${opt.label.replace(/&#x[^;]+; /,'')}</div>`).join('')}
      </div>
    </div>`;
  }).join('');

}

function toggleRbChip(key, e){
  e.stopPropagation();
  // Si ya tiene valor y hacen clic en el chip → desmarca directamente
  if(rbState[key] > 0){
    rbState[key] = 0;
    buildRoomBathSelector({...rbState});
    return;
  }
  // Si no tiene valor → abrir dropdown para elegir cantidad
  const dd = document.getElementById('rb-dd-'+key);
  if(!dd) return;
  const isOpen = dd.classList.contains('open');
  closeAllRbDropdowns();
  if(!isOpen) dd.classList.add('open');
}

function selectRbQty(key, qty, e){
  e.stopPropagation();
  rbState[key] = qty;
  buildRoomBathSelector({...rbState});
}

function closeAllRbDropdowns(){
  document.querySelectorAll('.rb-dropdown').forEach(d=>d.classList.remove('open'));
}

function buildAmenitiesChecks() {
  const container = document.getElementById('amenities-check-list');
  container.innerHTML = AMENITIES_LIST.map(a => `
    <label class="amen-check-item" id="amen-${a.key}">
      <input type="checkbox" value="${a.key}" onchange="toggleAmenClass(this,'amen-${a.key}')">
      ${a.label}
    </label>`).join('');
}

function toggleAmenClass(cb, id) {
  document.getElementById(id).classList.toggle('selected', cb.checked);
}

function openFormModal(reset=true) {
  if (reset) {
    editId = null; curMainImg = ''; curGalleryImgs = [];
    document.getElementById('form-title').textContent = 'Nueva Propiedad';
    const dupBtn = document.getElementById('btn-duplicate'); if(dupBtn) dupBtn.style.display='none';
    document.getElementById('f-type').value = 'Casa';
    document.getElementById('f-name').value = '';
    document.getElementById('f-addr').value = '';
    document.getElementById('f-price').value = '';
    document.getElementById('f-docstatus').value = 'Transferible';
    document.getElementById('f-contact-name').value = '';
    document.getElementById('f-contact-tel').value = '';
    document.getElementById('f-negotiate').value = '1';
    document.getElementById('f-surf-util').value = '';
    document.getElementById('f-surf-const').value = '';
    document.getElementById('f-surf-total').value = '';

    document.getElementById('f-desc').value = '';
    const ua = document.getElementById('main-upload-area');
    ua.classList.remove('has-image');
    ua.querySelector('img.preview-img')?.remove();
    document.getElementById('main-img-hint').textContent = '';
    document.getElementById('gallery-previews').innerHTML = '';
    rbState = {rooms:0, baths:0, comedor:0, cocina:0, terraza:0, portal:0};
    buildRoomBathSelector();
    buildAmenitiesChecks();
  }
  document.getElementById('form-overlay').classList.add('open');
}

function closeFormModal() { document.getElementById('form-overlay').classList.remove('open'); }

function startEdit(id) {
  const p = properties.find(x=>x.id===id);
  if (!p) return;
  editId = id; curMainImg = p.mainImage||''; curGalleryImgs = [...(p.gallery||[])];
  buildAmenitiesChecks();
  document.getElementById('form-title').textContent = 'Editar Propiedad';
  const dupBtn = document.getElementById('btn-duplicate'); if(dupBtn) dupBtn.style.display='flex';
  document.getElementById('f-type').value = p.type||'Casa';
  document.getElementById('f-name').value = p.name||'';
  document.getElementById('f-addr').value = p.address||'';
  document.getElementById('f-price').value = p.price||'';
  document.getElementById('f-docstatus').value = p.docStatus||'Transferible';
  document.getElementById('f-contact-name').value = p.contactName||'';
  document.getElementById('f-contact-tel').value = p.contactTel||'';
  document.getElementById('f-negotiate').value = p.negotiate ? '1' : '0';
  document.getElementById('f-surf-util').value = p.surfUtil||'';
  document.getElementById('f-surf-const').value = p.surfConst||'';
  document.getElementById('f-surf-total').value = p.surfTotal||'';
  buildRoomBathSelector({rooms:p.rooms||0, baths:p.baths||0, comedor:p.comedor||0, cocina:p.cocina||0, terraza:p.terraza||0, portal:p.portal||0});
  document.getElementById('f-desc').value = p.description||'';

  // Foto principal
  const ua = document.getElementById('main-upload-area');
  if (curMainImg) {
    ua.classList.add('has-image');
    let img = ua.querySelector('img.preview-img');
    if (!img) { img = document.createElement('img'); img.className='preview-img'; ua.insertBefore(img, ua.firstChild); }
    img.src = imgURL(curMainImg);
  } else {
    ua.classList.remove('has-image');
    ua.querySelector('img.preview-img')?.remove();
  }

  // Amenidades
  (p.amenities||[]).forEach(k => {
    const el = document.querySelector(`#amenities-check-list input[value="${k}"]`);
    if (el) { el.checked = true; el.closest('.amen-check-item').classList.add('selected'); }
  });

  // Galería
  renderGalleryPreviews();

  openFormModal(false);
}

function duplicateProperty(){
  const name = document.getElementById('f-name').value.trim();
  const addr = document.getElementById('f-addr').value.trim();
  // Abrir mini-diálogo de confirmación de nombre/dirección
  document.getElementById('dup-name').value = name + ' (copia)';
  document.getElementById('dup-addr').value = addr;
  document.getElementById('dup-overlay').classList.add('open');
  setTimeout(()=>document.getElementById('dup-name').select(),100);
}

function closeDupDialog(){ document.getElementById('dup-overlay').classList.remove('open'); }

async function confirmDuplicate(){
  const newName = document.getElementById('dup-name').value.trim();
  const newAddr = document.getElementById('dup-addr').value.trim();
  if(!newName){ toast('El nombre es obligatorio','err'); return; }
  const amenities = [...document.querySelectorAll('#amenities-check-list input:checked')].map(x=>x.value);
  const obj = {
    id: 'p' + Date.now(),
    type: document.getElementById('f-type').value,
    name: newName,
    address: newAddr,
    price: Number(document.getElementById('f-price').value)||0,
    docStatus: document.getElementById('f-docstatus').value||'Transferible',
    contactName: document.getElementById('f-contact-name').value.trim(),
    contactTel: document.getElementById('f-contact-tel').value.trim(),
    negotiate: document.getElementById('f-negotiate').value === '1',
    surfUtil: Number(document.getElementById('f-surf-util').value)||0,
    surfConst: Number(document.getElementById('f-surf-const').value)||0,
    surfTotal: Number(document.getElementById('f-surf-total').value)||0,
    rooms: rbState.rooms||0, baths: rbState.baths||0,
    comedor: rbState.comedor||0, cocina: rbState.cocina||0,
    terraza: rbState.terraza||0, portal: rbState.portal||0,
    description: document.getElementById('f-desc').value.trim(),
    amenities,
    mainImage: curMainImg,
    gallery: [...curGalleryImgs],
  };
  properties.push(obj);
  const ok = await saveData();
  if(ok){
    toast('⧉ Propiedad duplicada');
    closeDupDialog(); closeFormModal(); renderProperties();
  } else {
    properties.pop();
    renderProperties();
  }
}

let _saving = false;
async function saveProperty() {
  if (_saving) return;            // evita doble envío si se pulsa dos veces
  const name = document.getElementById('f-name').value.trim();
  if (!name) { toast('El nombre es obligatorio', 'err'); return; }
  const priceVal = document.getElementById('f-price').value.trim();
  const price = priceVal === '' ? 0 : Number(priceVal);
  if (!Number.isFinite(price) || price < 0) { toast('El precio no es válido', 'err'); return; }
  const amenities = [...document.querySelectorAll('#amenities-check-list input:checked')].map(x=>x.value);
  const obj = {
    id: editId || ('p' + Date.now()),
    type: document.getElementById('f-type').value,
    name,
    address: document.getElementById('f-addr').value.trim(),
    price,
    docStatus: document.getElementById('f-docstatus').value||'Transferible',
    contactName: document.getElementById('f-contact-name').value.trim(),
    contactTel: document.getElementById('f-contact-tel').value.trim(),
    negotiate: document.getElementById('f-negotiate').value === '1',
    surfUtil: Number(document.getElementById('f-surf-util').value)||0,
    surfConst: Number(document.getElementById('f-surf-const').value)||0,
    surfTotal: Number(document.getElementById('f-surf-total').value)||0,
    rooms: rbState.rooms||0,
    baths: rbState.baths||0,
    comedor: rbState.comedor||0,
    cocina: rbState.cocina||0,
    terraza: rbState.terraza||0,
    portal: rbState.portal||0,
    description: document.getElementById('f-desc').value.trim(),
    amenities,
    mainImage: curMainImg,
    gallery: curGalleryImgs,
  };
  const snapshot = properties.slice();   // copia para revertir si falla el guardado
  if (editId) {
    const idx = properties.findIndex(x=>x.id===editId);
    if (idx !== -1) properties[idx] = obj; else properties.push(obj);
  } else {
    properties.push(obj);
  }
  _saving = true;
  const ok = await saveData();
  _saving = false;
  if (ok) {
    toast(editId ? '✅ Propiedad actualizada' : '✅ Propiedad publicada');
    closeFormModal(); renderProperties();
  } else {
    properties = snapshot;   // revertir: la pantalla no muestra cambios no guardados
    renderProperties();
  }
}

// ── GALLERY PREVIEWS + DRAG & DROP + EDIT ──
let _galleryDragIdx = null;

function cardQR(id) {
  const p = properties.find(x=>x.id===id);
  if(!p) return;
  const url = location.href.split('#')[0] + '?p=' + p.id;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  document.getElementById('qr-title').textContent = p.name || 'QR de la propiedad';
  document.getElementById('qr-img').src = qrApiUrl;
  document.getElementById('qr-url').textContent = url;
  document.getElementById('qr-overlay').classList.add('open');
}

function showPropertyQR() {
  const p = properties.find(x=>x.id===viewingId);
  if(!p) return;
  const url = location.href.split('#')[0] + '?p=' + p.id;
  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  document.getElementById('qr-title').textContent = p.name || 'QR de la propiedad';
  document.getElementById('qr-img').src = qrApiUrl;
  document.getElementById('qr-url').textContent = url;
  document.getElementById('qr-overlay').classList.add('open');
}
function downloadQR() {
  const img = document.getElementById('qr-img');
  fetch(img.src)
    .then(r => r.blob())
    .then(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'qr-propiedad.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    })
    .catch(() => window.open(img.src, '_blank'));
}
function closeQR() {
  document.getElementById('qr-overlay').classList.remove('open');
}

function renderGalleryPreviews() {
  const c = document.getElementById('gallery-previews');
  c.innerHTML = curGalleryImgs.map((img,i) => `
    <div class="gallery-prev-item" id="gprev-${i}"
         draggable="true"
         ondragstart="galleryDragStart(event,${i})"
         ondragover="galleryDragOver(event,${i})"
         ondragleave="galleryDragLeave(event,${i})"
         ondrop="galleryDrop(event,${i})"
         ondragend="galleryDragEnd()">
      <img src="${escAttr(imgURL(img))}" alt="">
      <button class="gallery-prev-del" onclick="event.stopPropagation();removeGalleryImg(${i})" title="Eliminar">✕</button>
      <button class="gallery-prev-edit" onclick="event.stopPropagation();editGalleryImg(${i})" title="Recortar / optimizar / cambiar">✏️</button>
      <span class="gallery-prev-drag-hint">⠿</span>
    </div>`).join('');
}

function removeGalleryImg(i) {
  curGalleryImgs.splice(i,1);
  renderGalleryPreviews();
}

function editGalleryImg(i) {
  const src = curGalleryImgs[i];
  // Reusar smartImagePick: si hay imagen muestra el modal edit/nueva
  smartImagePick(src, 'gallery-edit', function(dataUrl) {
    if(dataUrl) {
      curGalleryImgs[i] = dataUrl;
      renderGalleryPreviews();
    }
  });
}

// ── Drag & drop reorder ──
function galleryDragStart(e, i) {
  _galleryDragIdx = i;
  e.dataTransfer.effectAllowed = 'move';
  setTimeout(()=>{ const el=document.getElementById('gprev-'+i); if(el) el.classList.add('dragging-item'); }, 0);
}
function galleryDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  document.querySelectorAll('.gallery-prev-item').forEach(el=>el.classList.remove('drag-over'));
  if(i !== _galleryDragIdx) { const el=document.getElementById('gprev-'+i); if(el) el.classList.add('drag-over'); }
}
function galleryDragLeave(e, i) {
  const el=document.getElementById('gprev-'+i); if(el) el.classList.remove('drag-over');
}
function galleryDrop(e, i) {
  e.preventDefault();
  if(_galleryDragIdx === null || _galleryDragIdx === i) return;
  const moved = curGalleryImgs.splice(_galleryDragIdx, 1)[0];
  curGalleryImgs.splice(i, 0, moved);
  _galleryDragIdx = null;
  renderGalleryPreviews();
}
function galleryDragEnd() {
  _galleryDragIdx = null;
  document.querySelectorAll('.gallery-prev-item').forEach(el=>{
    el.classList.remove('dragging-item','drag-over');
  });
}

// ── IMAGE UPLOAD ──
function handleMainImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value='';
  openCropper(file, 'main', onMainImageDone);
}

function handleGalleryImages(e) {
  const files = [...e.target.files];
  e.target.value='';
  if (!files.length) return;
  let idx = 0;
  function next() {
    if (idx >= files.length) return;
    const f = files[idx++];
    openCropper(f, 'gallery', (dataUrl)=>{ curGalleryImgs.push(dataUrl); renderGalleryPreviews(); next(); });
  }
  next();
}

function onMainImageDone(dataUrl, sizeStr) {
  curMainImg = dataUrl;
  const ua = document.getElementById('main-upload-area');
  ua.classList.add('has-image');
  let img = ua.querySelector('img.preview-img');
  if (!img) { img = document.createElement('img'); img.className='preview-img'; ua.insertBefore(img, ua.firstChild); }
  img.src = dataUrl;
  if (sizeStr) document.getElementById('main-img-hint').textContent = '✅ ' + sizeStr;
}

// ── SMART IMAGE PICK ──
// ── IMAGE SYSTEM (cropper+optimizador+pegar, portado de Galería) ──
let cropperImg=null,cropperTarget=null,cropperCallback=null;
let cropBox={x:20,y:20,w:200,h:150};
let optCroppedDataUrl=null,optCroppedBlob=null;
let _optAspectLocked=false,_optAspectRatio=null;
let _optOriginalImg=null,_inlineCrop=null;

// Ajustes persistentes del optimizador entre fotos del mismo lote
const _optSettings={w:null,h:null,q:80,fmt:'image/webp',paleta:'full',preset:null};

function _saveOptSettings(){
  try{
    _optSettings.w=parseInt(document.getElementById('opt-rw').value)||800;
    _optSettings.h=parseInt(document.getElementById('opt-rh').value)||600;
    _optSettings.q=parseInt(document.getElementById('opt-rq').value)||80;
    _optSettings.fmt=document.getElementById('opt-fmt').value||'image/webp';
    _optSettings.paleta=document.getElementById('opt-paleta').value||'full';
  }catch(e){}
}

function _restoreOptSettings(){
  try{
    const rw=document.getElementById('opt-rw'); if(rw){rw.value=_optSettings.w; document.getElementById('opt-val-w').textContent=_optSettings.w;}
    const rh=document.getElementById('opt-rh'); if(rh){rh.value=_optSettings.h; document.getElementById('opt-val-h').textContent=_optSettings.h;}
    const rq=document.getElementById('opt-rq'); if(rq){rq.value=_optSettings.q; document.getElementById('opt-val-q').textContent=_optSettings.q;}
    const fmt=document.getElementById('opt-fmt'); if(fmt) fmt.value=_optSettings.fmt;
    const pal=document.getElementById('opt-paleta'); if(pal) pal.value=_optSettings.paleta;
  }catch(e){}
}
function openCropper(file,target,cb){
  cropperCallback=cb||null; cropperTarget=target;
  const reader=new FileReader();
  reader.onload=ev=>{ const img=new Image(); img.onload=()=>{ cropperImg=img; _optOriginalImg=img; _inlineCrop=null; optCroppedDataUrl=null; optCroppedBlob=null; document.getElementById('cropper-overlay').classList.add('open'); _restoreOptSettings(); _loadFullImageToOpt(img); }; img.src=ev.target.result; };
  reader.readAsDataURL(file);
}
function _loadFullImageToOpt(img){
  const maxPx=1400;
  let sx=0,sy=0,sw=img.width,sh=img.height;
  if(_inlineCrop){ sx=_inlineCrop.x; sy=_inlineCrop.y; sw=_inlineCrop.w; sh=_inlineCrop.h; }
  const s=maxPx/Math.max(sw,sh);
  const ow=Math.round(sw*s),oh=Math.round(sh*s);
  const tmp=document.createElement('canvas'); tmp.width=ow; tmp.height=oh;
  tmp.getContext('2d').drawImage(img,sx,sy,sw,sh,0,0,ow,oh);
  optCroppedDataUrl=tmp.toDataURL('image/jpeg',0.92); optCroppedBlob=null;
  const origImg=document.getElementById('opt-img-orig');
  origImg.src=optCroppedDataUrl;
  origImg.onload=()=>{
    const kb=Math.round(optCroppedDataUrl.length*.75/1024);
    document.getElementById('opt-stats-orig').innerHTML=`<span>${origImg.naturalWidth}×${origImg.naturalHeight}px</span><span>${kb} KB</span>`;
    // Escalar según preset — si hay crop activo, calcular alto proporcional al recorte
    let rw, rh;
    if(_optSettings.preset!==null){
      rw=_optSettings.preset;
      // alto proporcional al recorte real (no a la imagen completa)
      const cropAR=origImg.naturalWidth/origImg.naturalHeight;
      rh=Math.round(rw/cropAR);
    } else {
      rw=_optSettings.w!==null ? Math.min(_optSettings.w,2000) : Math.min(origImg.naturalWidth,1200);
      rh=_optSettings.h!==null ? Math.min(_optSettings.h,2000) : Math.min(origImg.naturalHeight,900);
    }
    document.getElementById('opt-rw').value=rw; document.getElementById('opt-val-w').textContent=rw;
    document.getElementById('opt-rh').value=rh; document.getElementById('opt-val-h').textContent=rh;
    document.getElementById('opt-rq').value=_optSettings.q; document.getElementById('opt-val-q').textContent=_optSettings.q;
    document.getElementById('opt-fmt').value=_optSettings.fmt;
    document.getElementById('opt-paleta').value=_optSettings.paleta;
    _optAspectLocked=true; _optAspectRatio=origImg.naturalWidth/origImg.naturalHeight;
    const lockBtn=document.getElementById('opt-lock-btn');
    if(lockBtn){ const gcd=(a,b)=>b?gcd(b,a%b):a; const d=gcd(origImg.naturalWidth,origImg.naturalHeight); lockBtn.style.background='var(--accent)'; lockBtn.style.color='#000'; lockBtn.textContent=`🔒 ${origImg.naturalWidth/d}:${origImg.naturalHeight/d}`; }
    _initInlineCropBox(); optReprocess(); _highlightPresetBtn(_optSettings.preset||0);
  };
}
function _getImgArea(){
  /* Calculate the actual rendered image area using natural aspect ratio + frame size.
     img has width:100%;height:100% so getBoundingClientRect gives the full frame —
     we must compute the object-fit:contain area manually. */
  const vp  = document.getElementById('opt-vp-orig');
  const img = document.getElementById('opt-img-orig');
  if(!vp||!img||!img.naturalWidth) return {offX:0,offY:0,rendW:vp?vp.offsetWidth:300,rendH:vp?vp.offsetHeight:200};
  const vpW = vp.offsetWidth, vpH = vp.offsetHeight;
  const iAR = img.naturalWidth / img.naturalHeight;
  const vAR = vpW / vpH;
  let rendW, rendH, offX, offY;
  if(iAR > vAR){
    rendW = vpW; rendH = Math.round(vpW / iAR);
    offX = 0;    offY  = Math.round((vpH - rendH) / 2);
  } else {
    rendH = vpH; rendW = Math.round(vpH * iAR);
    offY = 0;    offX  = Math.round((vpW - rendW) / 2);
  }
  return {offX, offY, rendW, rendH};
}
/* alias used by old code */
function _getRenderedImgArea(){ return _getImgArea(); }

/* ── INIT CROP BOX ───────────────────────────────────────────────────── */
function _initInlineCropBox(){
  const vp = document.getElementById('opt-vp-orig');
  const cb = document.getElementById('inline-crop-box');
  if(!vp||!cb) return;
  /* reset crop lock */
  window._cropLocked=false; window._cropAR=null;
  window._cropAspectLocked=false; window._cropAspectRatio=null;
  const btn = document.getElementById('icrop-lock-btn');
  if(btn){ btn.textContent='🔓'; btn.style.background='rgba(0,0,0,.6)';
           btn.style.color='rgba(255,255,255,.85)'; btn.style.border='1px solid rgba(255,255,255,.25)'; }
  cb._icAttached = false;
  setTimeout(()=>{
    const {offX,offY,rendW,rendH} = _getImgArea();
    const pad = 4;
    cb.style.left   = (offX+pad)+'px';
    cb.style.top    = (offY+pad)+'px';
    cb.style.width  = (rendW-pad*2)+'px';
    cb.style.height = (rendH-pad*2)+'px';
    cb.style.display = 'block';
    _attachCropHandlers();
    setTimeout(_updateCropLabel, 100);
  }, 80);
}

/* ── COORD CONVERSION ────────────────────────────────────────────────── */
function _cropBoxToOrigCoords(){
  const vp=document.getElementById('opt-vp-orig');
  const cb=document.getElementById('inline-crop-box');
  const img=document.getElementById('opt-img-orig');
  if(!vp||!cb||!img||!_optOriginalImg) return null;
  const {offX,offY,rendW,rendH} = _getImgArea();
  const cbL=parseFloat(cb.style.left)||0;
  const cbT=parseFloat(cb.style.top)||0;
  const cbW=parseFloat(cb.style.width)||rendW;
  const cbH=parseFloat(cb.style.height)||rendH;
  /* map from viewport px → original image px */
  const baseW=_inlineCrop?_inlineCrop.w:_optOriginalImg.width;
  const baseH=_inlineCrop?_inlineCrop.h:_optOriginalImg.height;
  const baseX=_inlineCrop?_inlineCrop.x:0;
  const baseY=_inlineCrop?_inlineCrop.y:0;
  const sx=baseW/rendW, sy=baseH/rendH;
  const rx=Math.max(0, Math.round(baseX+(cbL-offX)*sx));
  const ry=Math.max(0, Math.round(baseY+(cbT-offY)*sy));
  const rw=Math.min(Math.round(cbW*sx), _optOriginalImg.width-rx);
  const rh=Math.min(Math.round(cbH*sy), _optOriginalImg.height-ry);
  if(rw<4||rh<4) return null;
  return {x:rx,y:ry,w:rw,h:rh};
}
window._cropBoxToOrigCoordsExt = _cropBoxToOrigCoords;

function _updateCropLabel(){
  const lbl=document.getElementById('icrop-dims'); if(!lbl) return;
  const c=_cropBoxToOrigCoords(); if(c) lbl.textContent=c.w+' × '+c.h+' px';
}

function inlineCropApply(){
  if(!_optOriginalImg) return;
  const coords=_cropBoxToOrigCoords(); if(coords) _inlineCrop=coords;
  // Escalar para llenar el frame: usar el lado que mejor llena sin perder proporción
  if(coords){
    /* Fit crop to the orig viewport frame — upscale small crops to fill it */
    const vp=document.getElementById('opt-vp-orig');
    const vpR=vp?vp.getBoundingClientRect():{width:300,height:500};
    const frameW=vpR.width, frameH=vpR.height;
    const cropAR=coords.w/coords.h;
    const frameAR=frameW/frameH;
    let targetW,targetH;
    if(cropAR>frameAR){ targetW=Math.round(frameW); targetH=Math.round(frameW/cropAR); }
    else               { targetH=Math.round(frameH); targetW=Math.round(frameH*cropAR); }
    /* 2× for quality */
    targetW=Math.max(targetW*2, coords.w);
    targetH=Math.max(targetH*2, coords.h);
    _optSettings.preset=null;
    _optSettings.w=targetW; _optSettings.h=targetH;
    const rw=document.getElementById('opt-rw');
    const rh=document.getElementById('opt-rh');
    if(rw){ rw.value=targetW; document.getElementById('opt-val-w').textContent=targetW; }
    if(rh){ rh.value=targetH; document.getElementById('opt-val-h').textContent=targetH; }
    _highlightPresetBtn(0);
  }
  _loadFullImageToOpt(_optOriginalImg);
}
function _flashCropConfirm(){
  const vp=document.getElementById('opt-vp-orig'); if(!vp) return;
  const f=document.createElement('div');
  f.style.cssText='position:absolute;inset:0;border-radius:inherit;background:rgba(0,230,118,.28);pointer-events:none;z-index:20;transition:opacity .4s';
  vp.appendChild(f); requestAnimationFrame(()=>f.style.opacity='0'); setTimeout(()=>f.remove(),500);
}

/* ── CROP DRAG & RESIZE ──────────────────────────────────────────────── */
;(function(){
  const $cb=()=>document.getElementById('inline-crop-box');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  let drag=null, hdl=null, start=null;
  function pxy(e){ const t=e.touches?e.touches[0]:e; return{x:t.clientX,y:t.clientY}; }

  function capture(e, h){
    e.stopPropagation(); e.preventDefault();
    const box=$cb(); if(!box) return;
    hdl=h;
    drag=pxy(e);
    start={l:parseFloat(box.style.left)||0, t:parseFloat(box.style.top)||0,
           w:parseFloat(box.style.width)||100, h:parseFloat(box.style.height)||100};
  }

  function onMove(e){
    if(drag===null) return;
    e.preventDefault();
    const box=$cb(); if(!box) return;
    const {offX,offY,rendW,rendH}=_getImgArea();
    const maxR=offX+rendW, maxB=offY+rendH, MIN=20;
    const p=pxy(e); const dx=p.x-drag.x, dy=p.y-drag.y;

    if(hdl===''){
      /* move */
      const bw=parseFloat(box.style.width)||100, bh=parseFloat(box.style.height)||100;
      box.style.left=clamp(start.l+dx,offX,maxR-bw)+'px';
      box.style.top =clamp(start.t+dy,offY,maxB-bh)+'px';
    } else {
      /* resize — each handle explicit so lock is unambiguous */
      let l=start.l, t=start.t, w=start.w, h=start.h;
      const fixR=start.l+start.w; /* right edge fixed for l-handles */
      const fixB=start.t+start.h; /* bottom edge fixed for t-handles */

      if(hdl==='r' )  w=clamp(start.w+dx,MIN,maxR-start.l);
      if(hdl==='b' )  h=clamp(start.h+dy,MIN,maxB-start.t);
      if(hdl==='l' ){ l=clamp(start.l+dx,offX,fixR-MIN); w=fixR-l; }
      if(hdl==='t' ){ t=clamp(start.t+dy,offY,fixB-MIN); h=fixB-t; }
      if(hdl==='br'){ w=clamp(start.w+dx,MIN,maxR-start.l); h=clamp(start.h+dy,MIN,maxB-start.t); }
      if(hdl==='bl'){ l=clamp(start.l+dx,offX,fixR-MIN); w=fixR-l; h=clamp(start.h+dy,MIN,maxB-start.t); }
      if(hdl==='tr'){ w=clamp(start.w+dx,MIN,maxR-start.l); t=clamp(start.t+dy,offY,fixB-MIN); h=fixB-t; }
      if(hdl==='tl'){ l=clamp(start.l+dx,offX,fixR-MIN); w=fixR-l; t=clamp(start.t+dy,offY,fixB-MIN); h=fixB-t; }

      /* ── ASPECT RATIO LOCK ── */
      if(window._cropLocked && window._cropAR){
        const ar=window._cropAR;
        /* For corner handles, whichever axis moved more drives the lock */
        const absDx=Math.abs(dx), absDy=Math.abs(dy);
        let wDrives;
        if(hdl==='tl'||hdl==='tr'||hdl==='bl'||hdl==='br'){
          wDrives = absDx >= absDy;
        } else {
          wDrives = (hdl==='r'||hdl==='l');
        }
        if(wDrives){
          const nh=clamp(Math.round(w/ar),MIN,maxB-start.t);
          /* top handles: bottom fixed → top moves */
          if(hdl==='t'||hdl==='tl'||hdl==='tr'){ t=fixB-nh; h=nh; }
          else { t=start.t; h=nh; }
        } else {
          const nw=clamp(Math.round(h*ar),MIN,maxR-start.l);
          /* left handles: right fixed → left moves */
          if(hdl==='l'||hdl==='tl'||hdl==='bl'){ l=fixR-nw; w=nw; }
          else { l=start.l; w=nw; }
        }
      }
      box.style.left=l+'px'; box.style.top=t+'px';
      box.style.width=w+'px'; box.style.height=h+'px';
    }
    _updateCropLabel();
  }

  function onUp(){ drag=null; hdl=null; _updateCropLabel(); }

  function attach(){
    const box=document.getElementById('inline-crop-box');
    if(!box||box._icAttached) return; box._icAttached=true;
    /* box drag — only fires if NOT a handle click */
    box.addEventListener('mousedown', e=>{ if(!e.target.classList.contains('icrop-handle')) capture(e,''); });
    box.addEventListener('touchstart', e=>{ if(!e.target.classList.contains('icrop-handle')) capture(e,''); },{passive:false});
    /* handle resize */
    box.querySelectorAll('.icrop-handle').forEach(h=>{
      const hd=h.dataset.h;
      h.addEventListener('mousedown', e=>capture(e,hd));
      h.addEventListener('touchstart', e=>capture(e,hd),{passive:false});
    });
  }
  window._attachCropHandlers=attach;
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
  document.addEventListener('touchmove',onMove,{passive:false});
  document.addEventListener('touchend',onUp);
})();

/* also expose old name used in _initInlineCropBox */
function _attachInlineCropHandlers(){ if(window._attachCropHandlers) window._attachCropHandlers(); }
window._attachInlineCropHandlers=_attachInlineCropHandlers;

/* ── TOGGLE CROP LOCK ────────────────────────────────────────────────── */
window._cropLocked=false; window._cropAR=null;
/* aliases */
window._cropAspectLocked=false; window._cropAspectRatio=null;

function toggleCropLock(){
  const box=document.getElementById('inline-crop-box');
  const btn=document.getElementById('icrop-lock-btn');
  if(!box||!btn) return;
  window._cropLocked=!window._cropLocked;
  window._cropAspectLocked=window._cropLocked;
  if(window._cropLocked){
    const w=parseFloat(box.style.width)||100;
    const h=parseFloat(box.style.height)||100;
    window._cropAR=w/h;
    window._cropAspectRatio=window._cropAR;
    const gcd=(a,b)=>b?gcd(b,a%b):a;
    const wi=Math.round(w),hi=Math.round(h); const d=gcd(wi,hi);
    btn.textContent='🔒'; btn.style.background='var(--accent)';
    btn.style.color='#000'; btn.style.border='none';
    btn.title=`Proporción fija ${Math.round(wi/d)}:${Math.round(hi/d)} — clic para liberar`;
  } else {
    window._cropAR=null; window._cropAspectRatio=null;
    btn.textContent='🔓'; btn.style.background='rgba(0,0,0,.6)';
    btn.style.color='rgba(255,255,255,.85)'; btn.style.border='1px solid rgba(255,255,255,.25)';
    btn.title='Bloquear proporción del recorte';
  }
}

function closeCropper(){ document.getElementById('cropper-overlay').classList.remove('open'); cropperImg=null; cropperCallback=null; optCroppedDataUrl=null; optCroppedBlob=null; _optOriginalImg=null; _inlineCrop=null; }
function toggleAspectLock(){ _optAspectLocked=!_optAspectLocked; const btn=document.getElementById('opt-lock-btn'); if(_optAspectLocked){ const orig=document.getElementById('opt-img-orig'); _optAspectRatio=orig?.naturalWidth&&orig?.naturalHeight?orig.naturalWidth/orig.naturalHeight:parseInt(document.getElementById('opt-rw').value)/parseInt(document.getElementById('opt-rh').value); const gcd=(a,b)=>b?gcd(b,a%b):a; const w=orig?.naturalWidth||parseInt(document.getElementById('opt-rw').value); const h=orig?.naturalHeight||parseInt(document.getElementById('opt-rh').value); const d=gcd(w,h); btn.style.background='var(--accent)'; btn.style.color='#000'; btn.textContent=`🔒 ${w/d}:${h/d}`; btn.title='Desbloquear'; } else{ _optAspectRatio=null; btn.style.background='none'; btn.style.color='var(--accent)'; btn.textContent='🔓 libre'; btn.title='Bloquear'; } }
function optWidthChanged(val){ val=parseInt(val); document.getElementById('opt-val-w').textContent=val; if(_optAspectLocked&&_optAspectRatio){ const h=Math.max(50,Math.min(2000,Math.round(val/_optAspectRatio))); document.getElementById('opt-rh').value=h; document.getElementById('opt-val-h').textContent=h; } optReprocess(); if(![400,800,1200].includes(val)) _optSettings.preset=null; _saveOptSettings(); _highlightPresetBtn(_optSettings.preset||0); }
function optHeightChanged(val){ val=parseInt(val); document.getElementById('opt-val-h').textContent=val; if(_optAspectLocked&&_optAspectRatio){ const w=Math.max(50,Math.min(2000,Math.round(val*_optAspectRatio))); document.getElementById('opt-rw').value=w; document.getElementById('opt-val-w').textContent=w; } optReprocess(); _saveOptSettings(); }
function _highlightPresetBtn(w){
  [400,800,1200].forEach(v=>{
    const btn=document.getElementById(`preset-btn-${v}`);
    if(!btn) return;
    if(v===w){
      btn.style.background='var(--accent)'; btn.style.color='#000';
      btn.style.border='1px solid var(--accent)'; btn.style.boxShadow='0 0 8px color-mix(in srgb, var(--accent) 45%, transparent)';
    } else {
      btn.style.background='var(--surface)'; btn.style.color='var(--text2)';
      btn.style.border='1px solid var(--border)'; btn.style.boxShadow='none';
    }
  });
}
function applyWidthPreset(w){ document.getElementById('opt-rw').value=w; document.getElementById('opt-val-w').textContent=w; if(_optAspectLocked&&_optAspectRatio){ const h=Math.max(50,Math.min(2000,Math.round(w/_optAspectRatio))); document.getElementById('opt-rh').value=h; document.getElementById('opt-val-h').textContent=h; } optReprocess(); _optSettings.preset=w; _saveOptSettings(); _highlightPresetBtn(w); }
function optQuantize(ctx,w,h,levels){ const d=ctx.getImageData(0,0,w,h),px=d.data; const step=Math.max(1,Math.round(256/Math.cbrt(levels))); for(let i=0;i<px.length;i+=4){ px[i]=Math.round(px[i]/step)*step; px[i+1]=Math.round(px[i+1]/step)*step; px[i+2]=Math.round(px[i+2]/step)*step; } ctx.putImageData(d,0,0); }
function optReprocess(){ if(!optCroppedDataUrl) return; const origImg=document.getElementById('opt-img-orig'); if(!origImg.naturalWidth) return; const maxW=parseInt(document.getElementById('opt-rw').value); const maxH=parseInt(document.getElementById('opt-rh').value); const quality=parseInt(document.getElementById('opt-rq').value)/100; const fmt=document.getElementById('opt-fmt').value; const paleta=document.getElementById('opt-paleta').value; let w=origImg.naturalWidth,h=origImg.naturalHeight; const ratio=Math.min(maxW/w,maxH/h); const tooSmall=false; w=Math.round(w*ratio); h=Math.round(h*ratio); const oc=document.getElementById('opt-canvas'); oc.width=w; oc.height=h; const ctx=oc.getContext('2d'); ctx.drawImage(origImg,0,0,w,h); if(paleta!=='full') optQuantize(ctx,w,h,parseInt(paleta)); oc.toBlob(blob=>{ optCroppedBlob=blob; const url=URL.createObjectURL(blob); document.getElementById('opt-img-result').src=url; const origKB=Math.round(optCroppedDataUrl.length*.75/1024); const newKB=Math.round(blob.size/1024); const pct=((1-blob.size/(optCroppedDataUrl.length*.75))*100).toFixed(0); const better=blob.size<optCroppedDataUrl.length*.75; const warn=tooSmall?'<span style="color:#ffd740" title="Imagen más pequeña que el preset">&#9888;&#xFE0F; menor que preset</span>':''; document.getElementById('opt-stats-result').innerHTML=`<span>${w}×${h}px</span><span class="${better?'better':''}">${newKB} KB</span><span class="${better?'better':''}">${better?'−':'+'}${Math.abs(pct)}%</span>${warn}`; },fmt,quality); }
function applyOptimized(){ _saveOptSettings(); if(!optCroppedBlob&&!optCroppedDataUrl){ closeCropper(); return; } if(optCroppedBlob){ const reader=new FileReader(); reader.onload=ev=>{ const dataUrl=ev.target.result; document.getElementById('cropper-overlay').classList.remove('open'); const cb=cropperCallback; cropperCallback=null; if(cb) cb(dataUrl); optCroppedDataUrl=null; optCroppedBlob=null; _optOriginalImg=null; _inlineCrop=null; }; reader.readAsDataURL(optCroppedBlob); } else{ document.getElementById('cropper-overlay').classList.remove('open'); const cb=cropperCallback; cropperCallback=null; if(cb) cb(optCroppedDataUrl); optCroppedDataUrl=null; _optOriginalImg=null; _inlineCrop=null; } }

// Result zoom/pan
(function(){
  const MIN_Z=1,MAX_Z=8;
  let z=1,px=0,py=0,dragging=false,lastX=0,lastY=0;
  let pinchDist0=null,pinchZ0=1,pinchPx0=0,pinchPy0=0;
  function vp(){ return document.getElementById('opt-vp-result'); }
  function img_el(){ return document.getElementById('opt-img-result'); }
  function clampPan(){ const v=vp(); if(!v) return; const vpW=v.clientWidth,vpH=v.clientHeight; const img=img_el(); if(!img) return; const nat=img.naturalWidth&&img.naturalHeight?img.naturalWidth/img.naturalHeight:1; const rendH=vpH,rendW=rendH*nat; const maxX=Math.max(0,(rendW*z-vpW)/2); const maxY=Math.max(0,(rendH*z-vpH)/2); px=Math.max(-maxX,Math.min(maxX,px)); py=Math.max(-maxY,Math.min(maxY,py)); }
  function applyTransform(){ clampPan(); const img=img_el(); if(!img) return; if(z===1&&px===0&&py===0){ img.style.position=''; img.style.top=''; img.style.left=''; img.style.maxWidth=''; img.style.maxHeight=''; img.style.width=''; img.style.height=''; img.style.transform=''; img.style.transformOrigin=''; } else{ img.style.position='absolute'; img.style.top='50%'; img.style.left='50%'; img.style.maxWidth='none'; img.style.maxHeight='none'; img.style.width='auto'; img.style.height='100%'; img.style.transformOrigin='center center'; img.style.transform=`translate(calc(-50% + ${px}px), calc(-50% + ${py}px)) scale(${z})`; } const b=document.getElementById('opt-reset-result'); if(b) b.classList.toggle('visible',z!==1||px!==0||py!==0); }
  function onWheel(e){ e.preventDefault(); const rect=vp().getBoundingClientRect(); const cx=e.clientX-rect.left-rect.width/2,cy=e.clientY-rect.top-rect.height/2; const delta=e.deltaY<0?1.15:1/1.15; const newZ=Math.max(MIN_Z,Math.min(MAX_Z,z*delta)); px=cx-(cx-px)*(newZ/z); py=cy-(cy-py)*(newZ/z); z=newZ; applyTransform(); }
  function onMouseDown(e){ if(e.button!==0) return; dragging=true; lastX=e.clientX; lastY=e.clientY; vp()?.classList.add('dragging'); e.preventDefault(); }
  function onMouseMove(e){ if(!dragging) return; px+=e.clientX-lastX; py+=e.clientY-lastY; lastX=e.clientX; lastY=e.clientY; applyTransform(); }
  function onMouseUp(){ dragging=false; vp()?.classList.remove('dragging'); }
  function touchDist(t){ return Math.hypot(t[0].clientX-t[1].clientX,t[0].clientY-t[1].clientY); }
  function onTouchStart(e){ if(e.touches.length===1){ dragging=true; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; } else if(e.touches.length===2){ dragging=false; pinchDist0=touchDist(e.touches); pinchZ0=z; pinchPx0=px; pinchPy0=py; } e.preventDefault(); }
  function onTouchMove(e){ if(e.touches.length===1&&dragging){ px+=e.touches[0].clientX-lastX; py+=e.touches[0].clientY-lastY; lastX=e.touches[0].clientX; lastY=e.touches[0].clientY; applyTransform(); } else if(e.touches.length===2&&pinchDist0){ const d=touchDist(e.touches); const newZ=Math.max(MIN_Z,Math.min(MAX_Z,pinchZ0*(d/pinchDist0))); const v=vp(),rect=v.getBoundingClientRect(); const mid={x:(e.touches[0].clientX+e.touches[1].clientX)/2-rect.left-rect.width/2,y:(e.touches[0].clientY+e.touches[1].clientY)/2-rect.top-rect.height/2}; px=mid.x-(mid.x-pinchPx0)*(newZ/pinchZ0); py=mid.y-(mid.y-pinchPy0)*(newZ/pinchZ0); z=newZ; applyTransform(); } e.preventDefault(); }
  function onTouchEnd(e){ if(e.touches.length===0){ dragging=false; pinchDist0=null; } }
  function attach(){ const v=vp(); if(!v||v._zb) return; v._zb=true; v.addEventListener('wheel',onWheel,{passive:false}); v.addEventListener('mousedown',onMouseDown); v.addEventListener('touchstart',onTouchStart,{passive:false}); v.addEventListener('touchmove',onTouchMove,{passive:false}); v.addEventListener('touchend',onTouchEnd); v.addEventListener('dblclick',()=>{z=1;px=0;py=0;applyTransform();}); document.addEventListener('mousemove',onMouseMove); document.addEventListener('mouseup',onMouseUp); }
  window.optZoomReset=function(){ z=1;px=0;py=0;applyTransform(); if(_inlineCrop&&_optOriginalImg){_inlineCrop=null;_loadFullImageToOpt(_optOriginalImg);} };
  const _check=setInterval(()=>{ const v=vp(); if(v){ attach(); clearInterval(_check); } },200);
})();

// IMAGE ACTION MODAL
(function(){
  let _resolve=null;
  const _isMobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  function openModal(currentSrc,onDelete){
    return new Promise(resolve=>{
      _resolve=resolve;
      const modal=document.getElementById('imgActionModal');
      const prev=document.getElementById('iamPreview'); const sub=document.getElementById('iamSub');
      if(prev){ prev.src=currentSrc||''; prev.style.display=currentSrc?'':'none'; }
      if(sub) sub.textContent=currentSrc?'¿Qué deseas hacer con la foto?':'Agregar foto';

      const cropBtn=document.getElementById('iamBtnCrop');
      cropBtn.style.display=(currentSrc&&currentSrc.length>4)?'':'none';
      cropBtn.onclick=()=>{ cleanup(); closeModal(); resolve('crop'); };

      document.getElementById('iamBtnNew').onclick=()=>{ cleanup(); closeModal(); resolve('new'); };

      const delBtn=document.getElementById('iamBtnDelete');
      if(onDelete){ delBtn.style.display=''; delBtn.onclick=()=>{ cleanup(); closeModal(); resolve('delete'); }; }
      else { delBtn.style.display='none'; }

      // ── BOTÓN PEGAR ──────────────────────────────────────────────
      const pasteBtn=document.getElementById('iamBtnPaste');
      pasteBtn.style.display='';
      const pasteLabel=document.getElementById('iamPasteLabel');
      const pasteDesc=document.getElementById('iamPasteDesc');

      let _handled=false;
      function _handleFile(file){ if(_handled) return; _handled=true; cleanup(); closeModal(); resolve({file}); }
      function _noImageToast(){ const msg=document.createElement('div'); msg.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#ff5252;color:#fff;padding:10px 20px;border-radius:10px;font-family:Syne,sans-serif;font-size:12px;font-weight:700;z-index:9000'; msg.textContent='⚠️ No hay imagen en el portapapeles.'; document.body.appendChild(msg); setTimeout(()=>msg.remove(),3000); }

      // document paste — captura Ctrl+V desktop y el paste del pasteTrap en móvil
      function _docPasteHandler(ev){
        const items=Array.from(ev.clipboardData?.items||[]);
        const imgItem=items.find(i=>i.type.startsWith('image/'));
        if(imgItem){ ev.preventDefault(); _handleFile(imgItem.getAsFile()); }
      }
      document.addEventListener('paste',_docPasteHandler);

      // pasteTrap: contenteditable con pointer-events activos
      const trap=document.getElementById('pasteTrap');
      if(trap){
        const newTrap=trap.cloneNode(true);
        trap.parentNode.replaceChild(newTrap,trap);

        newTrap.addEventListener('paste',ev=>{
          ev.preventDefault(); ev.stopPropagation();
          const items=Array.from(ev.clipboardData?.items||[]);
          const imgItem=items.find(i=>i.type.startsWith('image/'));
          if(imgItem) _handleFile(imgItem.getAsFile()); else _noImageToast();
        });

        if(_isMobile){
          if(pasteLabel) pasteLabel.textContent='Pegar imagen del portapapeles';
          if(pasteDesc) pasteDesc.textContent='Mantén pulsado el botón → toca "Pegar"';
          // Dar foco al trap al abrir para que iOS lo reconozca en el long-press
          setTimeout(()=>{ try{ newTrap.focus({preventScroll:true}); }catch(e){} },120);
        } else {
          if(pasteLabel) pasteLabel.textContent='Pegar imagen';
          if(pasteDesc) pasteDesc.textContent='Presiona Ctrl+V para pegar';
        }

        // Mantener foco en el trap mientras el modal esté abierto
        newTrap.addEventListener('blur',()=>{
          if(!_handled && modal.classList.contains('open')){
            setTimeout(()=>{ if(!_handled){ try{ newTrap.focus({preventScroll:true}); }catch(e){} } },80);
          }
        });
      }

      function cleanup(){ document.removeEventListener('paste',_docPasteHandler); if(pasteBtn){ pasteBtn.style.background=''; pasteBtn.style.borderColor=''; } }
      document.getElementById('iamBtnCancel').addEventListener('click',()=>{ cleanup(); closeModal(); resolve(null); },{once:true});
      document.getElementById('iamBtnNew').addEventListener('pointerdown',cleanup,{once:true});
      modal.classList.add('open');
      modal.onclick=ev=>{ if(ev.target===modal){ cleanup(); closeModal(); resolve(null); } };
    });
  }

  function closeModal(){ document.getElementById('imgActionModal').classList.remove('open'); }

  async function smartPick(currentSrc,cropMode,onDone,onDelete){
    if(currentSrc) currentSrc = imgURL(currentSrc); // rutas del repo -> URL CDN
    const action=await openModal(currentSrc,onDelete);
    if(!action) return;
    if(action==='delete'){ if(onDelete) onDelete(); return; }
    if(action&&action.file){ openCropper(action.file,cropMode,onDone); return; }
    if(action==='new'){ const i=document.createElement('input'); i.type='file'; i.accept='image/*'; i.onchange=ev=>{ if(ev.target.files[0]) openCropper(ev.target.files[0],cropMode,onDone); }; i.click(); return; }
    if(action==='crop'){
      if(currentSrc&&currentSrc.length>4){
        const img=new Image(); img.onload=()=>{ cropperImg=img; _optOriginalImg=img; _inlineCrop=null; optCroppedDataUrl=null; optCroppedBlob=null; cropperCallback=onDone; document.getElementById('cropper-overlay').classList.add('open'); _loadFullImageToOpt(img); }; img.src=currentSrc;
      }
      return;
    }
  }
  window.smartImagePick=smartPick;
})();

// ── INIT ──
// ── FILTROS AVANZADOS ──
const ADV_FIELDS = [

  { key:'rooms',   label:'&#x1F6CC; Dormitorios',      max:10 },
  { key:'baths',   label:'&#x1F6BF; Serv. sanitarios', max:6  },
  { key:'comedor', label:'&#x1F37D; Comedor',           max:3  },
  { key:'cocina',  label:'&#x1F373; Cocina/Pantry',     max:3  },
  { key:'terraza', label:'&#x2600; Terraza',            max:3  },
  { key:'portal',  label:'&#x1F6AA; Portal',            max:3  },
];
let advFilters = {};

function buildAdvPanel(){
  const c = document.getElementById('adv-rows-container');
  if(!c) return;
  c.innerHTML = ADV_FIELDS.map(f => {
    const cur = advFilters[f.key];
    const gteOpts = Array.from({length:f.max-1},(_,i)=>i+2).map(n=>{
      const sel = cur && cur.dir==='gte' && cur.val===n;
      return `<span class="adv-opt${sel?' sel':''}" onclick="setAdvFilter('${f.key}','gte',${n},event)">&ge;&thinsp;${n}</span>`;
    }).join('');
    const lteOpts = Array.from({length:f.max-1},(_,i)=>i+2).map(n=>{
      const sel = cur && cur.dir==='lte' && cur.val===n;
      return `<span class="adv-opt${sel?' sel':''}" onclick="setAdvFilter('${f.key}','lte',${n},event)">&le;&thinsp;${n}</span>`;
    }).join('');
    return `<div class="adv-row">
      <div class="adv-row-label">${f.label}${cur?` <span style="color:var(--accent);font-size:9px">${cur.dir==='gte'?'&ge;':'&le;'} ${cur.val}</span>`:''}</div>
      <div class="adv-row-opts">${gteOpts}${lteOpts}</div>
    </div>`;
  }).join('');
}

function setAdvFilter(key,dir,val,e){
  e && e.stopPropagation();
  if(advFilters[key] && advFilters[key].dir===dir && advFilters[key].val===val){
    delete advFilters[key];
  } else {
    advFilters[key] = {dir,val};
  }
  updateAdvBadge(); buildAdvPanel(); renderProperties();
}

function clearAdvFilters(){
  advFilters = {};
  updateAdvBadge(); buildAdvPanel(); renderProperties();
}

// ── FILTRO COMODIDADES ──
let comFilters = new Set();

function buildComPanel(){
  const c = document.getElementById('com-rows-container');
  if(!c) return;
  c.innerHTML = AMENITIES_LIST.map(a => {
    const sel = comFilters.has(a.key);
    return `<div class="adv-row" style="flex-direction:row;align-items:center;justify-content:space-between;cursor:pointer" onclick="toggleComFilter('${a.key}')">
      <div class="adv-row-label" style="font-size:11px">${a.label}</div>
      <div style="width:20px;height:20px;border-radius:50%;border:2px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:11px;background:${sel?'var(--accent2)':'transparent'};border-color:${sel?'var(--accent2)':'var(--border)'};color:${sel?'#fff':'transparent'};transition:all .15s">&#x2713;</div>
    </div>`;
  }).join('');
}

function toggleComFilter(key){
  if(comFilters.has(key)) comFilters.delete(key);
  else comFilters.add(key);
  updateComBadge(); buildComPanel(); renderProperties();
}

function clearComFilters(){
  comFilters.clear();
  updateComBadge(); buildComPanel(); renderProperties();
}

// ── FILTRO DOCUMENTACIÓN ──
let docFilters = new Set();
const DOC_OPTS = [
  {key:'Transferible',  label:'✅ Transferible'},
  {key:'En Trámites',   label:'⏳ En Trámites'},
  {key:'Desactualizado',label:'⚠️ Desactualizado'},
  {key:'Sin Documento', label:'❌ Sin Documento'},
];

function buildDocPanel(){
  const c = document.getElementById('doc-rows-container');
  if(!c) return;
  c.innerHTML = DOC_OPTS.map(o => {
    const sel = docFilters.has(o.key);
    return `<div class="adv-row" style="flex-direction:row;align-items:center;justify-content:space-between;cursor:pointer;padding:4px 0" onclick="toggleDocFilter('${o.key}')">
      <div class="adv-row-label" style="font-size:11px">${o.label}</div>
      <div style="width:20px;height:20px;border-radius:50%;border:2px solid;display:flex;align-items:center;justify-content:center;font-size:11px;background:${sel?'var(--accent2)':'transparent'};border-color:${sel?'var(--accent2)':'var(--border)'};color:${sel?'#fff':'transparent'};transition:all .15s">&#x2713;</div>
    </div>`;
  }).join('');
}

function toggleDocFilter(key){
  if(docFilters.has(key)) docFilters.delete(key);
  else docFilters.add(key);
  updateDocBadge(); buildDocPanel(); renderProperties();
}

function clearDocFilters(){
  docFilters.clear();
  updateDocBadge(); buildDocPanel(); renderProperties();
}

function updateDocBadge(){
  const n = docFilters.size;
  const badge = document.getElementById('doc-badge');
  const btn   = document.getElementById('doc-filter-btn');
  if(badge){ badge.textContent=n; badge.style.display=n>0?'inline-flex':'none'; }
  if(btn) btn.classList.toggle('active', n>0);
}

function updateComBadge(){
  const n = comFilters.size;
  const badge = document.getElementById('com-badge');
  const btn   = document.getElementById('com-filter-btn');
  if(badge){ badge.textContent=n; badge.style.display=n>0?'inline-flex':'none'; }
  if(btn) btn.classList.toggle('active', n>0);
}

function updateAdvBadge(){
  const n = Object.keys(advFilters).length;
  const badge = document.getElementById('adv-badge');
  const btn   = document.getElementById('adv-filter-btn');
  if(badge){ badge.textContent=n; badge.style.display=n>0?'inline-flex':'none'; }
  if(btn) btn.classList.toggle('active', n>0);
}

function toggleAdvPanel(which, e){
  e && e.stopPropagation();
  const panelId = which==='loc' ? 'adv-panel-loc' : which==='doc' ? 'adv-panel-doc' : 'adv-panel-com';
  const panel = document.getElementById(panelId);
  if(!panel) return;
  const opening = !panel.classList.contains('open');
  closeAllAdvPanels();
  if(opening){
    if(which==='loc') buildAdvPanel();
    else if(which==='doc') buildDocPanel();
    else buildComPanel();
    panel.classList.add('open');
  }
}

function closeAllAdvPanels(){
  document.querySelectorAll('.adv-panel').forEach(p=>p.classList.remove('open'));
}

function closeAdvPanel(){ closeAllAdvPanels(); }

// ── LISTENER GLOBAL ÚNICO ──
document.addEventListener('click', function(e){
  if(!e.target.closest('.adv-wrap')) closeAllAdvPanels();
  if(!e.target.closest('.rb-bubble')) closeAllRbDropdowns();
});

loadData();
updateAuthUI();
updateFavUI();
