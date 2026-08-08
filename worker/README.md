# LLAVE en Mano — Worker de guardado seguro

Este Worker resuelve el problema de seguridad de la versión anterior: el
token de GitHub ya no viaja al navegador ni queda visible en el código de
`index.html`. Ahora vive únicamente como *secret* en Cloudflare, y el
navegador solo habla con este Worker (que a su vez habla con GitHub).

## Qué cambia para el usuario final

Nada del panel de administración cambia salvo una cosa: al iniciar sesión
ya **no se pide el token de GitHub**, solo la contraseña. El Worker se
encarga del resto.

## 1. Requisitos

- Una cuenta gratuita de Cloudflare ( https://dash.cloudflare.com/sign-up )
- Node.js instalado en tu computadora
- El paquete `wrangler` (la CLI de Cloudflare Workers):

```bash
npm install -g wrangler
wrangler login
```

Esto abre el navegador para autorizar la CLI contra tu cuenta de Cloudflare.

## 2. Crear el token de GitHub (fine-grained, con permiso mínimo)

1. Ve a GitHub → Settings → Developer settings → **Fine-grained tokens** →
   *Generate new token*.
2. En "Repository access", elige **Only select repositories** y selecciona
   solo `Vhome` (el repo de este proyecto).
3. En "Permissions" → "Repository permissions", pon **Contents: Read and
   write**. Todo lo demás en "No access".
4. Genera el token y cópialo — solo se muestra una vez.

Este es el único lugar donde este token va a existir a partir de ahora
(guardado como secret de Cloudflare, nunca en el navegador).

## 3. Desplegar el Worker

Desde esta carpeta (`worker/`):

```bash
wrangler deploy
```

Wrangler te va a dar una URL parecida a:
`https://llave-en-mano-api.tu-subdominio.workers.dev`

Guarda esa URL, la necesitas en el paso 5.

## 4. Configurar los secrets

Estos tres comandos te van a pedir el valor uno por uno (no queda en tu
historial de terminal):

```bash
wrangler secret put GITHUB_TOKEN
# pega el token fine-grained del paso 2

wrangler secret put APP_PASS
# la contraseña con la que entrarás al panel admin

wrangler secret put SESSION_SECRET
# una cadena aleatoria larga, por ejemplo generada con:
# openssl rand -hex 32
```

## 5. Conectar `index.html` con el Worker

Abre `index.html` y busca esta línea (cerca de la configuración de GitHub):

```js
const WORKER_URL = 'https://llave-en-mano-api.TU-SUBDOMINIO.workers.dev';
```

Reemplázala por la URL real que te dio `wrangler deploy` en el paso 3.

## 6. (Recomendado) Restringir CORS a tu dominio real

En `wrangler.toml`, cambia:

```toml
[vars]
ALLOWED_ORIGIN = "*"
```

por el dominio real donde publiques la app, por ejemplo:

```toml
[vars]
ALLOWED_ORIGIN = "https://tuusuario.github.io"
```

y vuelve a desplegar con `wrangler deploy`. Así, aunque alguien copie tu
`index.html`, su copia no podrá guardar cambios en tu repo — el Worker
solo acepta peticiones desde tu dominio.

## Cómo funciona por dentro (resumen)

- `POST /login` — recibe la contraseña, la compara con el secret
  `APP_PASS` y, si coincide, devuelve una sesión firmada (HMAC) que expira
  sola a las 6 horas. El Worker no guarda nada en una base de datos: la
  propia sesión lleva la firma que permite verificarla después.
- `PUT /data` — recibe el `data.json` nuevo (y el `sha` anterior, para
  evitar sobrescribir cambios de otra persona) y hace el commit a GitHub
  usando el `GITHUB_TOKEN` guardado en el servidor.
- `PUT /image` — igual, pero para subir una foto individual.

Ambas rutas exigen una sesión válida en el header `Authorization: Bearer
<token>` — sin sesión, o con una sesión vencida, el Worker responde 401 y
nunca llega a tocar el token real de GitHub.

## Costos

El plan gratuito de Cloudflare Workers incluye 100,000 peticiones/día, muy
por encima de lo que un catálogo de propiedades como este necesita. No
deberías pagar nada.
