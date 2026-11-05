---
title: "Vio reel: cómo pasa el bloque de Replit a modo remoto (fase 3 de ADR-0042)"
date: 2026-11-05
author: claude
status: live
audience: agente de Replit (CMS de Mote & Livsstil), Angelo
---

# Vio reel: el bloque de Replit en modo remoto

Contexto: [ADR-0042](../decisions/0042-vio-reel-experiencias-gestionadas-desde-commerce.md). Hoy el
reel de Replit guarda vídeos y productos en el código del artículo. En modo remoto el artículo guarda
solo `experienceId`; la experiencia vive en Vio, se edita desde Replit **y** desde Vio, y el reproductor
de Replit (el actual, sin cambios de UI) la lee publicada. La API está en
`vio-campaigns-microservice` (PR [#31](https://github.com/vio-live/vio-campaigns-microservice/pull/31))
y sale a QA detrás de `https://api-staging.vio.live` cuando esté aplicada la migración del kernel.

## Dos keys, dos sitios

| Key | Dónde vive | Para qué |
|---|---|---|
| **Key pública de la surface** (`X-Api-Key`, la de siempre) | servidor de Replit y navegador | leer la revisión publicada (`GET /v2/experiences/:id`) |
| **Key de gestión de la surface** (`X-Management-Key`, nueva) | **solo el servidor de Replit** | crear, editar, subir vídeo, publicar. Nunca al navegador, nunca en la query |

La key de gestión la emite Vio desde su dashboard (`POST /api/client-apps/:id/management-key`) y se la
pasa Angelo a Replit como secreto de servidor. Rotarla invalida la anterior al instante.

## El flujo del editor (servidor de Replit)

1. **Arrastrar el bloque** → `POST /v2/experiences` con
   `{ campaignId, title, sponsorId? }` (la campaña que el editor eligió para el artículo; el sponsor
   por defecto es el primario). Respuesta 201 con `id` y `version: 1`. El artículo guarda solo `id`.
2. **Subir un vídeo** → `POST /v2/experiences/:id/media` con `{ kind: 'upload', name }`. Respuesta
   `{ id: mediaId, status: 'pending', upload: { url, expiresAt } }`. El editor sube el archivo a
   `upload.url` (POST multipart, campo `file`, hasta 200 MB; o tus) **directo a Cloudflare**: los bytes
   no pasan ni por Replit ni por Vio. Después, `GET /v2/experiences/:id/media/:mediaId` hasta
   `status: 'ready'` (trae `playbackUrl` HLS, `posterUrl`, `durationSeconds`). Un mp4 ya alojado en
   otro sitio: `{ kind: 'url', src, posterUrl }` → `ready` al instante.
3. **Editar el borrador** → `PUT /v2/experiences/:id/draft` con la cabecera **`If-Match: <version>`**
   (la `version` que se leyó) y el body:

   ```json
   {
     "title": "Slik styler du Careless",
     "draft": {
       "schemaVersion": 1,
       "theme": { "--vio-radius": "12px" },
       "videos": [
         {
           "id": "influencer",
           "title": "Se og shop favorittene",
           "mediaId": 12,
           "products": [
             { "productId": 416052, "imageOverrideUrl": "https://…/a.jpg", "focal": { "x": 0.5, "y": 0.3 } },
             { "productId": 416053 }
           ],
           "cues": [ { "productId": 416052, "at": 2.5 } ]
         }
       ]
     }
   }
   ```

   Mapeo desde el bloque actual: `videoClips[]` → `videos[]`; `videoUrl`/`videoPoster` → `mediaId`;
   `videoCaption` → `title`; `productRefs` (`sponsor:product`) → `products[].productId`;
   `videoProductCues` → `cues[]` (`at` en segundos). Sin `If-Match`: 428. Si Vio editó antes: **409
   `EXPERIENCE_STALE`** con `details.version`; el editor recarga (`GET …/:id?view=editor`) y reintenta.
4. **Publicar** → `POST /v2/experiences/:id/publish` con `If-Match`. Vio comprueba que cada vídeo
   tenga media lista (400 `MEDIA_NOT_READY`) y que todos los productos estén en el catálogo del sponsor
   en esta surface (400 `PRODUCT_NOT_IN_SPONSOR_CATALOG` con los ids). Respuesta con
   `publishedRevision`, `etag` y `revisions[]`.
5. **Abrir el editor más tarde** → `GET /v2/experiences/:id?view=editor` (key de gestión): borrador,
   `version`, media y revisiones. Mostrar «Gestionada desde Vio · revisión N». `?preview=draft` devuelve
   el borrador ya resuelto con la misma forma que leen los lectores, para previsualizar.
6. **Volver atrás** → `POST …/rollback { revision }`; **borrar** → `DELETE …/:id`.

## El reproductor (lo que hoy ya pinta Replit)

`GET https://api-staging.vio.live/v2/experiences/:id` con `X-Api-Key` (la pública). Respuesta:

```json
{
  "schemaVersion": 1, "id": 7, "revision": 3, "publishedAt": "…",
  "campaignId": 12, "sponsorId": 1338, "campaign": { "id": 12, "name": "Careless Aller" },
  "title": "…", "binding": { "slot": null }, "theme": { "--vio-radius": "12px" },
  "videos": [ { "id": "influencer", "title": "…",
    "media": { "provider": "cloudflare-stream", "playbackUrl": "https://…/manifest/video.m3u8", "dashUrl": "…", "posterUrl": "…", "durationSeconds": 12.5, "width": 1080, "height": 1920 },
    "products": [ … ], "cues": [ … ] } ]
}
```

Reglas para el reproductor (son las del ADR, puntos 6 a 8):

- Cabeceras: `ETag` y `Cache-Control: public, max-age=60, stale-while-revalidate=600`. Mandar
  `If-None-Match` y aceptar 304. Guardar la última respuesta válida por `experienceId` y usarla si la
  red falla. Una revisión nueva se aplica en la **siguiente** apertura, nunca a mitad de un swipe.
- Si `campaignId` no es la campaña del artículo, **no pintar nada** (y avisar en consola). Nunca
  productos de otra campaña como fallback, nunca un sponsor por defecto.
- `playbackUrl` es HLS: Safari nativo; el resto con `hls.js` cargado solo cuando hay un reel en la
  página. Con `provider: 'url'` es el archivo tal cual.
- Los productos siguen saliendo por el SDK como hasta ahora (`productRefs` = `${sponsorId}:${productId}`),
  con el mismo carrito y checkout. Analítica: añadir `experience_id`, `video_id` y `revision` a los
  eventos del reel; `Vio.analytics.setInternal(true)` se respeta igual.

## Errores que el editor tiene que mostrar

| Código | Qué significa |
|---|---|
| 428 `IF_MATCH_REQUIRED` | faltó `If-Match` |
| 409 `EXPERIENCE_STALE` | alguien escribió antes; recargar y reintentar |
| 400 `INVALID_EXPERIENCE` (`details.path`) | el borrador se sale del esquema |
| 400 `MEDIA_NOT_READY` / `MEDIA_NOT_FOUND` / 409 `MEDIA_IN_USE` | vídeo no listo, de otra experiencia, o en uso |
| 400 `PRODUCT_NOT_IN_SPONSOR_CATALOG` (`details.productIds`) | productos que no son del sponsor en esta surface |
| 503 `MEDIA_UPLOADS_NOT_CONFIGURED` / `MEDIA_PROVIDER_UNAVAILABLE` / `CATALOG_UNAVAILABLE` | reintentar; el entorno no tiene Stream, o Cloudflare / Commerce no respondieron |
| 404 | la experiencia o la campaña no son de esta surface (o no existen) |

Lo que pide SDK nueva, no config: cualquier layout o gesto que no quepa en `videos`, `products`,
`cues` y `theme`.

## Mensaje enviado a Replit (2026-11-05, tarde): instalar la beta y conectar lo real

Decisión de Angelo: **el demo `/demo/vio-reel` se queda como está** (se usa con clientes); Replit conecta la
integración real al lado, con `@vio-live/web-sdk@0.38.0-beta.1` (dist-tag `beta`, `latest` sigue en 0.37.8) y
`<vio-reel experience-id="1">` contra la experiencia 1 de la surface 13 de QA; después se mezcla todo.

Resumen de lo que se le pidió: instalar la beta; renderizar el reel en un artículo con el mismo contexto de
página que los demás bloques (`data-vio-scope`, `data-vio-campaign`); no reimplementar el reproductor; respetar
las reglas del componente (una sola fuente de verdad con ETag y revisión fija por carga, la campaña de la página
decide y una incompatible no pinta nada, tema solo por tokens, `hls.js` desde `cdn.jsdelivr.net` → CSP); crear
experiencias solo desde su servidor con la key de gestión (apartado de arriba); devolver una URL de QA con el
reel por la SDK y los avisos de consola.
