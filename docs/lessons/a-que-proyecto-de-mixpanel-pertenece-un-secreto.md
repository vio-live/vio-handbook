---
title: "Un secreto de Mixpanel no dice de qué proyecto es (y el host EU/US tampoco)"
last-updated: 2026-10-13
---

# Síntoma

Te pasan `MIXPANEL_API_SECRET` para producción y lo pones en el `.env`. El fan-out responde 200 y
los contadores suben. Parece correcto — pero si el secreto era el del proyecto de **staging**
(`4055964` en vez de `4055947`), los eventos de producción se están escribiendo en el proyecto
equivocado y nada falla ni avisa.

Agrava: `api-eu.mixpanel.com` y `api.mixpanel.com` **aceptan los dos el mismo secreto** (Mixpanel
enruta por credencial, no por host), así que probar contra el host de otra región no distingue nada.

# Causa real

La credencial identifica al proyecto por sí misma y la API no te dice cuál es. Un 200 solo prueba
"este secreto es válido para algún proyecto".

# Cómo se comprueba, sin escribir datos

`POST /import?strict=1&project_id=<id>` con un evento deliberadamente inválido (sin
`properties.time`). La auth se evalúa ANTES de la validación del payload:

```bash
curl -s -u "$SECRET:" -X POST \
  "https://api-eu.mixpanel.com/import?strict=1&project_id=4055947" \
  -H 'Content-Type: application/json' \
  -d '[{"event":"__probe__","properties":{}}]'
```

| Respuesta | Qué significa |
|---|---|
| `400` + `'properties.time' is invalid: must not be missing` + `num_records_imported:0` | el secreto **sí** es de ese `project_id`, y no se escribió nada |
| `401 Credentials in request did not match project_id URL parameter` | el secreto es de **otro** proyecto |
| `401 Unauthorized, invalid project secret` | el secreto no sirve en ningún proyecto |

Un payload vacío (`[]`) **no sirve de sonda**: Mixpanel lo rechaza con 400 por Content-Type antes de
mirar la credencial, así que da el mismo resultado con secreto bueno y malo.

# Dos cosas más del mismo sitio

- **El `MIXPANEL_PROJECT_TOKEN` no autentica el fan-out.** El sink del colector usa solo el API
  secret (Basic `base64(secret:)`). El token se parsea en `config.ts` y ningún código lo lee. Si la
  auth del fan-out falla, el sospechoso es el secreto.
- **La API de query va con retraso.** Tras importar, `events/names`, `events` y hasta JQL pueden
  devolver vacío un par de minutos. Eso no es un fan-out roto: reintentar antes de dudar del sink.
  Para la prueba de humo, mirar primero `forwarded`/`lastError` en el `/health` del colector.
