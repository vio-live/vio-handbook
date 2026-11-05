---
title: "0042 — Vio reel: experiencias de vídeo shoppable gestionadas desde Commerce, editables desde Replit y desde Vio"
date: 2026-11-05
status: proposed
owner: angelo
deciders: [angelo]
related: ["0025", "0026", "0027", "0034", "0041"]
---

# 0042 — Vio reel: experiencias gestionadas desde Commerce

## Contexto

Replit construyó para Aller un reel de vídeo shoppable: feed vertical con snap, precarga
del vídeo vecino, bucle, autoplay silenciado, barra de progreso, tarjetas de producto
pulsables y ficha de producto sin parar el vídeo. Demo en
`mote-livsstil-hub-vio.replit.app/demo/vio-reel` (QA: surface `f17c3ac0…`, campaña 12,
sponsor 1338).

Lo que hay el 2026-11-05:

- **El reproductor es de Replit**, unos 45 KB de React dentro de su bloque `vioProducts`
  con `presentation: "reel"`. La web SDK (0.37.7) solo pone identidad del sponsor, carrito,
  checkout, ficha y analítica; el reel le habla por eventos `vio:product-click`,
  `vio:product-add` y `vio:open-cart`.
- **La configuración está en el código del artículo**: `videoClips[{ videoUrl, videoPoster,
  videoCaption, productRefs, videoProductCues }]`. Los mp4 viven en el storage de Replit y
  se sirven enteros, sin calidades ni trozos.
- **El demo ya valida lo que pedimos**: comprueba que los artículos compartan campaña y
  sponsor, se niega a cargar con otro sponsor y marca `Vio.analytics.setInternal(true)`.

Aller pidió convertirlo en un componente de la SDK con configuración remota
(`<vio-reel experience-id="…">`), con borrador, previsualización, publicación, versiones,
caché con invalidación, fallback seguro, atribución estable y solo configuración
declarativa. Angelo añadió dos cosas que la propuesta no decía:

1. **Aller quiere seguir editando en Replit.** El editor de Vio es primero para nosotros;
   el acceso a Aller llega después. La experiencia tiene que poder gestionarse desde los
   dos lados, como se gestionaban los componentes de iOS y Android desde el dashboard viejo.
2. **El vídeo necesita infraestructura de verdad**: descarga por trozos, calidades y CDN,
   no un mp4 en un blob.

## Decisión

1. **La experiencia es una entidad de Commerce y Vio es la fuente de verdad.** Vive en
   `vio-campaigns-microservice` junto a campaña, surface y slots (ADR-0025/0027), atada a
   una campaña y por tanto a un sponsor. Nada de vídeos ni de productos guardados en Replit.
   vio-backend no recibe nada: está retirado.

2. **Dos editores sobre el mismo borrador, con concurrencia optimista.** Replit crea la
   experiencia al arrastrar el bloque, desde su servidor, con una **key de gestión del
   publisher** distinta de la key pública de la surface; esa key nunca baja al navegador.
   En el artículo solo queda `experienceId` y su posición. Cada escritura lleva la revisión
   leída (`If-Match`); si otro publicó en medio, 409 y el editor recarga. Replit muestra
   «gestionada desde Vio, revisión N» y la vuelve a pedir al abrir su editor. No hay
   bloqueos ni merges. El editor de Vio va en webapp-vio-commerce vía base-api, con el rol
   de publisher de ADR-0026; primero lo usamos nosotros.

3. **Borrador, publicación y versiones.** `draft` editable, `publish` crea una revisión
   inmutable y la marca como actual, `rollback` apunta a una anterior. Los lectores solo
   reciben la revisión publicada; la previsualización interna pide `?preview=draft` con la
   key de gestión.

4. **Dos modos de enganche a la página.** Por id explícito (`experience-id`, lo que usa
   Replit) desde la primera fase. Por slot (`<vio-reel slot="…">`, el modelo de ADR-0034)
   en una fase posterior: la página declara el hueco y desde Vio se decide qué experiencia
   lo llena sin que el publisher republique. El contrato lo contempla desde el día uno.

5. **Vídeo en Cloudflare Stream.** Subida directa desde el editor contra una URL de un solo
   uso que entrega nuestra API; los bytes no pasan por nuestros pods. Stream transcodifica,
   genera portada y sirve HLS y DASH por su CDN. En nuestro modelo se guarda el id de
   reproducción y la portada, no el archivo. Se mantiene `src` por URL para mp4 externos
   como camino de compatibilidad, no como camino recomendado. **La analítica de
   reproducción la emite nuestro reproductor a nuestro colector**; la de Stream no se usa.

6. **`<vio-reel>` en la web SDK, con HLS.** Safari nativo; el resto carga `hls.js` solo
   cuando hay un reel en la página. Precarga del vecino inmediato y nada más allá.
   Misma experiencia: swipe vertical continuo con el vecino visible, bucle, autoplay
   silenciado, skeletons, tarjetas pulsables, ficha sin parar el vídeo. Estilo solo por
   tokens `--vio-*` vía `applyVioTheme` (web-sdk.md); los tokens que falten para igualar el
   reel de Replit (chip de marca, badge de envío, «en el vídeo ahora») se añaden a la SDK
   con versión. Vev envuelve el mismo custom element.

7. **Compatibilidad con la campaña, sin sponsor por defecto.** La experiencia lleva
   `campaignId` y `sponsorId`. La SDK los compara con la campaña de la página; si no
   coinciden no pinta nada, avisa en consola y emite `reel_incompatible`. Nunca cambia de
   sponsor ni enseña productos de otra campaña como fallback.

8. **Caché e invalidación.** `GET` público con `ETag` y `Cache-Control: public, max-age=60,
   stale-while-revalidate=600`; al publicar se purga la URL en el CDN. La SDK guarda la
   última revisión válida por experiencia y campaña en `localStorage` y la usa si la red
   falla. Una revisión nueva se aplica en la siguiente apertura o carga, nunca a mitad de
   una interacción.

9. **Solo configuración declarativa.** JSON con `schemaVersion`; el reproductor valida e
   ignora lo que no conoce. Es remoto todo lo que cabe en el esquema (vídeos, orden,
   títulos, productos, cues, imágenes sustituidas y su encuadre, tokens de estilo). Pide
   SDK nueva cualquier layout o gesto nuevo. Nada de JavaScript remoto.

10. **Atribución.** Los eventos del reel llevan `experience_id`, `video_id`, `slot`,
    `revision`, además del artículo de origen y la campaña que ya mandan los demás
    componentes. Respetan la marca interna de ADR-0041.

### Contrato (borrador)

```json
{
  "schemaVersion": 1,
  "id": "exp_01J…",
  "revision": 7,
  "campaignId": 12,
  "sponsorId": 1338,
  "title": "Slik styler du Careless",
  "binding": { "slot": null },
  "theme": { "--vio-radius": "12px" },
  "videos": [
    {
      "id": "vid_01J…",
      "title": "Influencer",
      "media": { "provider": "cloudflare-stream", "playbackId": "abc…", "posterUrl": "https://…" },
      "products": [
        { "productId": 416052, "imageOverrideUrl": "https://…", "focal": { "x": 0.5, "y": 0.3 } }
      ],
      "cues": [ { "productId": 416052, "at": 4.5 } ]
    }
  ]
}
```

### API (borrador, `api.vio.live`)

| Método | Ruta | Key | Uso |
|---|---|---|---|
| `GET` | `/v2/experiences/:id` | surface (pública) | revisión publicada; `?preview=draft` con key de gestión |
| `POST` | `/v2/experiences` | gestión del publisher | crea borrador atado a una campaña |
| `PUT` | `/v2/experiences/:id/draft` | gestión | edita; `If-Match: <revision>` |
| `POST` | `/v2/experiences/:id/publish` | gestión | nueva revisión, purga CDN |
| `POST` | `/v2/experiences/:id/rollback` | gestión | `{ revision }` |
| `POST` | `/v2/experiences/:id/uploads` | gestión | URL de subida directa a Stream |
| `GET` | `/v2/experiences?campaignId=` | gestión | listado para los editores |

### Fases

1. Este ADR aceptado con el contrato cerrado.
2. Entidad, API y subida a Stream en el micro de campañas.
3. Replit pasa su bloque a modo remoto con su reproductor actual: crea al arrastrar, sube
   por nuestra URL, lee nuestra config. Valida caché, fallback y la edición a dos manos
   antes de tocar la SDK.
4. `<vio-reel>` en la web SDK con HLS, y el envoltorio en Vev.
5. Editor en el dashboard de Commerce, primero para nosotros.
6. Analítica con experiencia, vídeo, slot y revisión en colector y ClickHouse.
7. Enganche por slot.

## Consecuencias

- Es un producto, no un componente: semanas de una persona, con Alan probando cada fase.
  No se antepone a Villoid, QKC ni Faves, que esperan su pedido de prueba.
- Aparece una key de gestión por publisher que hay que emitir, rotar y guardar en el
  servidor de Replit. Es la primera credencial de escritura que damos a un cliente.
- Commerce pasa a pagar y operar vídeo: cuenta de Cloudflare Stream, cuota por minuto
  almacenado y entregado, y purga de CDN en el publish.
- La SDK crece con `hls.js` bajo demanda y con los tokens nuevos; cada token nuevo se
  comprueba en los componentes que lo consumen (lección de web-sdk.md).
- Replit deja de alojar vídeos; sus mp4 actuales se migran o se dejan como `src` externo.

## Alternativas descartadas

- **Mux.** Equivalente a Stream, pero su valor diferencial es la analítica de
  reproducción y ya tenemos la nuestra. Descartado por Angelo el 2026-11-05.
- **Blob de Azure + Front Door + ffmpeg propio.** Control total, pero transcodificación,
  empaquetado HLS y caché son otro proyecto y su mantenimiento es nuestro. Azure Media
  Services ya no existe.
- **Dejar el reproductor en Replit y solo remotar la config.** Resuelve Replit pero no a
  Aller en su CMS real ni a Vev; el componente tiene que venir de la SDK.
- **Que Replit sea la fuente de verdad y Vio un espejo.** Invierte la propiedad de la
  campaña y hace imposible gestionar desde Vio sin pedirle a Replit.
- **Ubicarlo en vio-backend.** Retirado por ADR-0025.
