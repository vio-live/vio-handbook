---
date: 2026-11-05
session: vio-reel fase 2 — lo que falta es Cloudflare Stream (Miguel)
participants: [angelo, miguel]
status: live
---

## Qué hice y por qué

Angelo me avisó de que claude había dejado algo en el handoff
([vio-reel-replit-modo-remoto](../../handoff/2026-11-05-vio-reel-replit-modo-remoto.md),
[journal de la fase 2](2026-11-05-vio-reel-fase-2.md)). Lo que el journal me asigna es
«Miguel solo donde yo no llego (release del kernel si falla el flujo por Actions, secretos)».
Verifiqué las dos cosas en vivo.

## El release por Actions NO falló — no hay nada que rescatar

- `package-database` run `42021266384` **success** (4m40s, 11:43Z) → kernel **1.0.290** publicado.
- `vio-campaigns-microservice`: `kernel-published` `42021952207` success (55s), bump a 1.0.290
  `42022066149` success, y el merge de #31 `42023512910` success (6m19s, 12:00Z).
- Los dos PR #31 están **mergeados** (kernel 11:43Z, micro 12:00Z).

## La migración en QA ya está aplicada

Consultado desde el pod de users contra la base de QA (`outshifter`, `10.224.0.7`):

- `migrations` última fila: **`SurfaceExperience1792900000000`**
- tablas `surface_experience`, `surface_experience_revision`, `surface_experience_media` creadas
- `surface.management_api_key` presente; **surface 13 (Mote Livestill Hub) ya tiene key emitida**
- `surface_experience`: 1 fila («Smoke vio-reel QA», version 5, `publishedRevision` 1)

`GET https://api-staging.vio.live/v2/experiences` con `X-Management-Key` → **200** con la
experiencia publicada. La API está viva en QA.

## Lo único que falta: credenciales de Cloudflare Stream

Medido, no supuesto:

```
POST /v2/experiences/1/media  {"kind":"upload","name":"probe-miguel.mp4"}
503 {"code":"MEDIA_UPLOADS_NOT_CONFIGURED"}
```

El pod `campaigns-f94df9585-plrjg` (2/2 Running) **no tiene ninguna variable `CLOUDFLARE_*`**: ni en
el entorno del proceso ni en el `.env.local` horneado en la imagen. Que el pod esté sano confirma que
las vars son **opcionales** (el micro degrada a 503, no revienta al arrancar) — no es el caso de
«variable obligatoria sin defecto tumba el arranque».

**No puedo emitir el token yo.** Los tres tokens de Cloudflare que tengo
(R2, DNS, Cache/Rules) dan 403 contra `/accounts/:id/stream`:

- R2 y Cache/Rules → `10002 Authorization Failure`
- DNS → `10000 Authentication error`

Ninguno tiene permiso para crear tokens, así que el token de Stream lo tiene que crear Angelo en el
dashboard: **Account → Stream: Edit** sobre la cuenta `dadb55a0fefc29713a6944ca4fa42c5b`.
El `CLOUDFLARE_ACCOUNT_ID` ya lo tengo (es ese mismo, está en mi `TOOLS.md`).

Ojo con dos cosas antes de pedirlo:

1. **Stream es un producto de pago aparte** ($5 por 1.000 min almacenados/mes con mínimo de $5, y
   ~$1 por 1.000 min entregados). Para un puñado de clips de reel es calderilla, pero es una línea
   nueva en la factura de Cloudflare y hoy no hay ninguna.
2. **En QA el `.env` va horneado en la imagen** (campaigns no monta Secret de k8s, lee `.env.local`):
   cargar las vars = cambiar el blob `containerqasc`/`env-file-microservices`/`.env.local` **y
   reconstruir la imagen del micro**. Reiniciar el pod no sirve.

## Pendiente

- Token de Stream de Angelo → cargarlo en el blob de QA + rebuild de campaigns → reprobar el
  `POST …/media` (debe dar 201 con `upload.url`).
- Producción: cuando toque, la clave va en el Secret de k8s `env-sc-campaigns`, no en el blob.
