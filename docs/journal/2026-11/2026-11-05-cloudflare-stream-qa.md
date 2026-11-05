---
date: 2026-11-05
session: Cloudflare Stream cargado en QA — vio-reel deja de dar 503 (Miguel)
participants: [angelo, miguel]
status: live
---

## Qué se hizo

Cerrar el único hueco que quedaba de la fase 2 de [ADR-0042](../../decisions/0042-vio-reel-experiencias-gestionadas-desde-commerce.md):
las credenciales de Cloudflare Stream en el micro de campañas de QA
(ver [la verificación previa](2026-11-05-vio-reel-stream-credenciales.md)).

Angelo activó Stream y creó el token; yo lo validé, lo cargué y verifiqué el camino entero.

## El plan ya no cuesta 5 USD/mes: Cloudflare lo vende con Images

Lo que yo había dicho («mínimo 5 USD/mes») **era falso a día de hoy**. Cloudflare empaqueta ahora
Images y Stream, y la primera opción es **pago por uso desde 0 USD/mes**: 5 USD por 1.000 min
almacenados y 1 USD por 1.000 min servidos, sin cuota fija. Angelo contrató esa.

El Starter Bundle (5 USD/mes) incluye 1.000 min almacenados y 5.000 servidos — justo lo que cuestan
esos mismos 5.000 min en pago por uso, así que **solo compensa por encima de ese consumo**, y su
cuota de Images no nos sirve (el resizer es nuestro). Revisar si el reel pasa de ~5.000 min/mes.

## El token

- Scope **Account → Stream: Edit**, sin caducidad, id `ca6dd79837e6b107aa43444dda0a83cd`.
  Valor en el `TOOLS.md` de Miguel, **no aquí** (repo compartido).
- Validado **contra la operación que usa el micro**, no contra un `verify` genérico:
  `POST /accounts/<acc>/stream/direct_upload` → 200 con `uploadURL`. La prueba se borró.
- Los otros tres tokens de Cloudflare (R2, DNS, Cache/Rules) dan **403 `10002`** contra
  `/accounts/:id/stream`. No perder tiempo con ellos.

## Cómo se cargó (y el detalle que casi lo deja sin efecto)

1. Blob `containerqasc`/`env-file-microservices`/`.env.local`: respaldo previo en
   **`.env.local.backup-pre-cfstream-20261105`** (16.256 bytes, md5 `ca4e230c…`), y el nuevo con
   las dos vars al final. El diff es **solo añadido**, nada modificado. Verificado leyéndolo de
   vuelta: md5 local y remoto iguales (`13679b3b…`).
2. Comprobado antes de reconstruir que el deployment `campaigns` de QA **no tiene `env`, ni
   `envFrom`, ni volúmenes**: el `.env.local` horneado en la imagen es lo que corre de verdad.
   La lección de prod (`env-del-blob-no-llega-a-la-imagen`, donde un Secret de k8s tapaba el
   fichero) **no aplica aquí**.
3. Rebuild: el workflow **solo tiene trigger `push`**, no `workflow_dispatch`. En vez de ensuciar
   `develop` con un commit vacío, relancé el run del merge de #31 (`42023512910`): reconstruye el
   mismo commit `15369b23` y se baja el blob ya actualizado. Verde en ~5 min.

### Trampa: el re-run reconstruye la imagen pero NO despliega

La etiqueta de imagen es `github.run_number`, y **un re-run conserva el número** (45). Helm genera
un manifiesto idéntico → upgrade sin cambios → **los pods no se reemplazan** y el pod viejo sigue
con el `.env` antiguo, aunque el tag 45 del registry ya sea la imagen nueva.

Se arregla con un `kubectl rollout restart deploy/campaigns`: con `imagePullPolicy: Always` el pod
nuevo se baja el tag 45 reconstruido. Si alguien relanza un run para recoger un cambio del blob y
no ve el efecto, es esto, no el blob.

## Verificación de punta a punta (no solo el 201)

- Pod nuevo `campaigns-b57bf7d87-2ffgs`, 2/2: `grep -c "^CLOUDFLARE_" .env.local` → **2**.
- `POST /v2/experiences/1/media {"kind":"upload"}` → **201** (antes 503) con
  `upload.url` de `upload.cloudflarestream.com` y `expiresAt` a 1 h.
- **Subido un clip real** (3 s, 540x960, 55 KB, generado con ffmpeg) a esa URL → 200.
- `GET …/media/2` pasó de `pending` a **`ready` en ~40 s**, con `playbackUrl` HLS, `dashUrl`,
  `posterUrl`, `durationSeconds: 3`, `width/height` correctos.
- El HLS y la portada se sirven **públicos, sin firma**: `m3u8` 200, `thumbnail.jpg` 200.
  Stream generó tres calidades: 240x426, 360x640, 480x852.
- `DELETE /v2/experiences/1/media/2` → 200, y **la cuenta de Stream queda vacía**: el micro borra
  también el vídeo en Cloudflare, no deja huérfanos.
- QA sano: `/v2/mobile/config` 200 y `GET /v2/experiences/1` 200 con la key pública de la surface 13.

Un aviso para no diagnosticar en falso: la key pública de la surface de **producción**
(`mote_livsstil_hub_api_key_…`, la del `TOOLS.md`) da **401** contra `api-staging`. Es lo esperado,
no una regresión; la de QA hay que sacarla de `surface.api_key` en la base de QA.

## Pendiente

- **Producción**: cuando toque, las dos vars van en el Secret de k8s `env-sc-campaigns`
  (el chart suma `values-prod.yaml` y monta el Secret sobre `/usr/src/app/.env`), **no en el blob**.
  Se puede reusar el mismo token: es de cuenta, no de entorno.
- Revisar el gasto de Stream si el reel coge volumen (umbral ~5.000 min servidos/mes).
