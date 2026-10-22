---
title: MIXPANEL_IDENTITY=simplified encendido en staging y produccion
date: 2026-10-22
last-updated: 2026-10-22
tags: [analytics, mixpanel, produccion, staging]
---

## Identidad de Mixpanel encendida en los dos colectores — Miguel

- Quién: Miguel, a pedido de Angelo (propuesta del agente de analytics).
- Dónde: VMs del colector `vio-analytics` — produccion `82.70.54.151` y staging `129.151.196.99`.
  Fichero `/opt/vio-analytics/.env`, servicio systemd `vio-analytics`.
- Cuándo: 2026-10-22, staging ~19:47 CEST, produccion ~19:52 CEST.
- Contexto: la identidad simplificada (`$device_id` / `$user_id`) une al usuario anonimo con el
  identificado en Mixpanel. Encenderla **despues** de que el proyecto tenga eventos parte la
  historia del navegador: el `distinct_id` canonico del anonimo pasa a `$device:<anon>`. Por eso
  habia que hacerlo antes del go-live del lunes 26/10, no despues.

### Camino elegido
Solo `.env` + reinicio, **sin deploy**. El binario que ya corria (`c2fc1614`, 168533 bytes, mismo
en las dos VMs) acepta la variable: `MIXPANEL_IDENTITY: z.enum(["off","simplified"]).default("off")`.
La alternativa (desplegar `main` = `76859ab`, que lo trae por defecto) se descarto: metia un deploy
nuevo a dos dias de la congelacion de prod sin ganar nada.

### Verificaciones previas (todas medidas, no asumidas)
- La variable **no estaba puesta** en ninguna de las dos VMs (`grep -c` = 0). Sin duplicados.
- El `dist/index.js` desplegado contiene la logica: `if (identity === "simplified" && !fromServer)`.
  `fromServer` se decide por **nombre de evento** (`SERVER_EVENT_NAMES`), asi que los eventos de
  servidor (`order_paid`, `order_cancelled`, `order_refunded`, `ad_activation`, `cart_intent`)
  **nunca** llevan identidad. Confirmado leyendo el bundle, no la documentacion.
- Coste de encenderlo hoy = **cero**: `vio_production.events` tiene **0 filas** (lifetime) y el
  proyecto Mixpanel de prod (4055947) devuelve `[]` en `/api/2.0/events/names`. No hay historia que
  partir. Dentro de una semana ya no seria gratis.

### Verificacion end-to-end (staging)
Evento con forma de navegador inyectado por `POST /v1/events` con el token interno y
`client_app_id 15` (`event_id 30b893f5-b813-4b3c-83f8-f373bb67c0f5`, `session_start`):
- colector: `inserted` 1 y `mixpanel.forwarded` 1 subiendo juntos, `lastError: null`.
- Mixpanel (export API): el evento sale con `distinct_id: u-miguel-identity-test`,
  `$device_id: a-miguel-identity-test-0001`, `$user_id: u-miguel-identity-test`. Es exactamente el
  comportamiento buscado.

### Verificacion en produccion sin ensuciar datos
Prod no se probo con un evento a proposito: su ClickHouse y su proyecto de Mixpanel estan a 0 y
conviene que lleguen asi al lunes. En su lugar, prueba directa de que el proceso vivo tiene la
variable — el unit usa `EnvironmentFile=/opt/vio-analytics/.env`, asi que
`tr '\0' '\n' < /proc/<MainPID>/environ | grep MIXPANEL_IDENTITY` devuelve `simplified`.
`/health` en `status: ok`, `ready: true`, `uptime_s` bajo (reinicio efectivo).

### Hecho
- `MIXPANEL_IDENTITY=simplified` anadido al final de `/opt/vio-analytics/.env` en las dos VMs.
- `systemctl restart vio-analytics` en las dos. Reinicio de segundos; prod sin trafico, staging sin
  perdida observable.
- Respaldos: `.env.backup-pre-identity-20261022-*` en cada VM (permisos preservados con `cp -p`).

### Pendiente
- Nada bloqueante. Queda un residuo en staging: la fila de prueba
  `a-miguel-identity-test-0001` en `vio_staging.events` y su evento en el Mixpanel de staging.
  Es dato de prueba en un entorno de prueba; no se borra para no tocar ClickHouse por un cosmetico.
- ClickHouse no cambia en nada con esto: la identidad solo afecta al payload que va a Mixpanel.
