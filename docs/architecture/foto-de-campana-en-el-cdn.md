---
title: "Foto de campaña en el CDN — contrato del fichero"
last-updated: 2026-11-18
owner: angelo
status: active
---

# Foto de campaña en el CDN

> **Estado (2026-11-18):** en prod para la campaña 7 (VG × Kondomeriet, Black Week). En QA, para la campaña 12
> (surface 13). Código: `vio-campaigns-microservice`, `src/modules/snapshots/` (PR #42 a develop, #43 a main).
> **Pendiente para que lo lea un navegador:** CORS, ver «Bloqueo: CORS» abajo.

## Para qué

En un móvil 4G con caché vacía, la página de VG tardaba ~4,7 s en pintar la primera tarjeta. ~1,1 s de eso era
esperar a `GET api.vio.live/v2/mobile/config` y después a la consulta GraphQL de productos, cada una con conexión
nueva al AKS. `container.vio.live` (Cloudflare delante del blob) responde un HIT en ~0,15 s. La foto deja las dos
cosas ya resueltas en un fichero estático del CDN.

**Medido en prod (18/11, surface de VG):** `…/snapshots/cb29caad495006e33774c41970475cf7.json`, 31 productos,
110 KB (20 KB en gzip, que Cloudflare aplica solo), MISS ~0,3–0,6 s y HIT ~0,2–0,3 s desde la laptop;
`config` idéntica a la de `api.vio.live/v2/mobile/config?platform=vev`; `generatedAt` avanzando 90 s por pasada.

## Contrato del fichero

**URL:** `https://container.vio.live/reachu-uploads-production/snapshots/<h>.json`, con
`h` = los primeros 32 caracteres del sha256 en hex de la key **pública** de la surface (la que ya va en
`?apiKey=`). La key nunca va en claro en el nombre. En JS:

```js
const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(surfaceKey));
const h = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
```

**Forma** (`version: 1`; sube solo con un cambio que rompa a quien lo lee):

```json
{
  "version": 1,
  "generatedAt": "2026-11-18T21:05:35.137Z",
  "market": { "currency": "NOK", "shippingCountryCode": "NO" },
  "config": { "…": "exactamente lo que devuelve GET /v2/mobile/config?platform=vev para esa surface" },
  "catalogs": [{ "campaignId": 7, "sponsorId": 1305, "channelId": "…", "productIds": [1, 2, 3] }],
  "products": [{
    "id": 1, "brand": "…", "title": "…", "description": "…", "quantity": 12, "origin_url": "https://…",
    "price": { "amount": 0, "amount_incl_taxes": 0, "currency_code": "NOK", "compare_at": null, "compare_at_incl_taxes": null },
    "images": [{ "id": "…", "url": "…", "width": 0, "height": 0, "order": 0 }],
    "options_enabled": false, "options": [{ "id": "…", "name": "…", "order": 0, "values": "…" }],
    "variants": [{ "id": "…", "title": "…", "sku": "…", "quantity": 0, "price": { "…": "igual que arriba" }, "images": [] }]
  }]
}
```

- `config`: la misma respuesta que el endpoint (mismo código, `SdkService.config`), con
  `endpoints.webSocketBase` como si la hubiera pedido `api.vio.live`.
- `products`: `Channel.GetProducts` (el channel entero, es decir sus colecciones compartidas) de cada sponsor de
  las campañas de la foto, con la **forma cruda del GraphQL** de Commerce (snake_case, como en las consultas
  `KondomerietCards` / `KondomerietProducts` de vev), en NOK/NO, `image_size: large`, sin cache del gateway.
  Sin repetir: `catalogs[]` dice qué ids son de qué campaña, sponsor y channel.
- Es **público**: lo mismo que la API ya le da a cualquiera con la key pública de la surface. Nada más.

**Frescura:**

- Se regenera cada **90 s** (un solo pod, lock `GET_LOCK` de MySQL). `generatedAt` avanza 90 s en cada pasada.
- `Cache-Control: public, max-age=30, s-maxage=60, stale-while-revalidate=300`: el navegador revalida a los 30 s;
  Cloudflare guarda 60 s y sirve lo viejo hasta 5 min mientras revalida. Peor caso razonable: ~2,5 min de antigüedad.
- Si una pasada falla (Commerce o Azure caídos), el fichero anterior sigue sirviendo: **quien lo lea debe mirar
  `generatedAt`** y, si es viejo (sugerencia: más de 10 min), pedir a la API como siempre.
- Si la campaña deja de estar activa (pausada, terminada) o la surface se desactiva o cambia de key, el fichero se
  borra en la pasada siguiente: un 404 significa «no hay foto», no «no hay campaña». Ir a la API.
- Cloudflare ignora la query string en ese host: `?v=` no rompe la caché.

## Cómo se consume (SDK y bloques)

1. Pedir la foto en paralelo con (o en vez de) la config. Si llega, es reciente y trae la campaña, pintar con
   `config` + `products` sin esperar a la API.
2. Seguir pidiendo la config y los productos en segundo plano para lo que cambie en vivo (stock al abrir la ficha,
   checkout): la foto es para el primer pintado, no para cobrar.

## Qué surfaces llevan foto

Filtro explícito por campaña, nunca todas: `CDN_SNAPSHOT_CAMPAIGN_IDS` en el `env` del chart de campaigns
(`values.yaml` QA = `12`, `values-prod.yaml` prod = `7`). Añadir una campaña es un PR al chart (y release a main).
La credencial del container (`AZURE_SERVICE_CONTAINER_CONNECTION_STRING`, `AZURE_BUCKET`) ya venía en el `.env`
compartido de los micros, también en el Secret `env-sc-campaigns` de prod: no hubo que añadir nada.

## Bloqueo: CORS

El fichero se sirve bien (curl: 200, HIT), pero **un `fetch()` desde vg.no o un dominio de Vev no lo puede leer**:
ni el blob ni Cloudflare devuelven `Access-Control-Allow-Origin` (medido el 18/11: GET con `Origin` sin la
cabecera; `OPTIONS` 403; las reglas CORS de la cuenta de QA, `containerqasc`, están vacías). Opciones, sin decidir:

- **Regla de Cloudflare** (Transform Rule de respuesta, `Access-Control-Allow-Origin: *` en
  `/reachu-uploads-production/snapshots/*`): la más limpia; la puede poner quien tenga acceso a Cloudflare.
- **CORS en la cuenta de Azure** (`GET`, origen `*`): afecta a todos los containers de la cuenta, y Azure solo
  responde la cabecera si la petición trae `Origin`, así que Cloudflare puede cachear una copia sin ella.
- **Variante `.js`** (`window.__VIO_SNAPSHOT__ = …`) cargada con `<script>`, que no necesita CORS.
