---
date: 2026-09-24
session: vio-sync-apps-custom-tokens
participants: [angelo, claude]
status: live
---

# Session — 2026-09-24 — Makeup Mekka instaló, el agujero del token y el arreglo completo (app y backend)

## Goal

Empezó como un status de la mañana (¿aguantó la noche el arreglo de tokens del 23?) y
terminó siendo el día en que el token de las apps custom dejó de ser una copia que se
muere: Makeup Mekka instaló, dijo que había exportado dos productos que nunca salieron, y al
buscar por qué apareció un agujero de ~20 minutos por hora que había que cerrar **por
diseño**, no por cadencia. Regla de Angelo para todo el día: son clientes reales, la
instalación actual se mantiene, y antes de pedirles que reexporten, Alan prueba y deja
evidencia.

## Done

**Mañana — la noche aguantó, y la mitad del app del rediseño**

- El cron corrió 24 veces en 12 h, cero 401, Gladkokken siguió importando.
- Alan cerró [XxteZiYt](https://trello.com/c/XxteZiYt) (PR #8 de `extensions` desplegado y
  probado; votó por la heurística sin bandera ni migración). Tarjetas al día para que tuviera
  el cuadro completo: [J7E6j9dM](https://trello.com/c/J7E6j9dM) (tokens en logs por tres
  vías), [u2MfJLCf](https://trello.com/c/u2MfJLCf) (rediseño del token),
  [x4L6KDhY](https://trello.com/c/x4L6KDhY) (webhooks / hipótesis del stock, aparcada).
- `GET /internal/token` en el app (`16bbebd`, los cuatro proyectos): devuelve el token
  vigente ya rotado y su vencimiento con el mismo secreto que la ruta de sync. Aditiva.

**Makeup Mekka instaló; Villoid no**

- Makeup Mekka instaló a las 13:10 Oslo (usuario Vio **1325**, conexión **540**) y conectó
  a los dos minutos. A las 14:00 dijeron que habían "exportado dos productos": **no llegó
  nada** — cero POST de sync en el app, cero llamadas a `POST /api/products/shopify-sqs`
  en `base-api` (de ninguna tienda, en 8 h), cero `importShopifyProduct` para 1325, y el bus
  de Azure con 0 activas y 0 en DLQ. Lo más probable, dado el UI: tildaron dos productos
  (solo cliente) y no apretaron **"Export selected"**. Angelo les mandó las instrucciones
  en noruego.
- Villoid "instaló" y no instaló: el Dev Dashboard de la org marca **0 installs** para
  `vio-client-1` (1 en cada una de las otras tres apps). Fuente de verdad para esto: la
  lista de apps del Dev Dashboard, no los logs. Hipótesis: abrieron el link desde otra
  tienda (el link custom está atado a `villoid.myshopify.com`).

**Lo que apareció buscando eso**

1. **El agujero del token, medido.** El token de Makeup Mekka venció a las 14:10:56 y el
   cron lo repuso a las 14:30:16. En esa ventana cada webhook de su tienda falló con
   `401 Invalid API key`, y como en `extensions` el error del refresh sube, **Pub/Sub
   reentregó el mismo mensaje una y otra vez**: la orden `7199057707139` llegó 12 veces en
   un minuto; 75 `orders/fulfilled` para 11 órdenes; 577 `products/update` para 85
   productos. Buena parte del "goteo" de webhooks que atribuíamos a un ERP o al stock eran
   reintentos por fallo.
2. **Un bug viejo del backend**: en cada upsert de la conexión, `extensions` intentaba
   registrar los webhooks con el ARN de EventBridge de la app pública (`api_client_id
   4479607`) y Shopify respondía `422 ... instead of '426736517121'` para las apps custom;
   el código logueaba `created` igual. Los webhooks reales de esas apps entran por Pub/Sub
   (declarados en el `toml`).
3. **Lo conocido, verificado uno por uno**: el lock de Redis del refresh (julio,
   `pmsXD6wr`) ya es atómico con TTL; `expires` NaN, arreglado el 23; la key de otro usuario
   en el dashboard, arreglada en prod; cola y DLQ vacías. Quedaba un solo problema real: el
   token.

**El arreglo en el app** — `vio-shopify-sync`
[#107](https://github.com/vio-live/vio-shopify-sync/pull/107) y
[#108](https://github.com/vio-live/vio-shopify-sync/pull/108), rama `custom/client-app`

- **Renovación anticipada**: si a la sesión offline le quedan menos de 35 minutos (25 en el
  #107, 35 desde el #108), el app hace el grant `refresh_token` contra Shopify con las
  credenciales de *su* app, guarda la sesión nueva y esa es la que empuja a Vio y la que
  entrega `/internal/token`. Si Shopify no lo da, sigue con la que había y queda auditado.
- **Cron cada 10 minutos** (antes 30).
- **Auditoría**: cada `connect` / `sync` / `remove` del merchant, cada reencolado y cada
  renovación queda en `[vio-audit] {...}` y en Redis por tienda (últimas 50), con ids,
  respuesta de Vio y vencimiento del token en ese momento; `GET /internal/audit?shop=`
  lo devuelve. Angelo descartó el aviso a Slack.
- Sin variables nuevas ni `shopify app deploy`. 240 tests, cobertura 100 %.
- Alan mergeó el #107 a las 16:02 y el #108 a las 16:49. Deploys de Vercel: el #107 lo
  disparó Claude a pedido de Angelo (16:08–16:12, Villoid al segundo intento por un "Not
  authorized" al asignar el alias); el #108 lo desplegaron **las dos sesiones** sin
  saberlo (Claude 20:25, Miguel 20:35 — mismo commit `491a282`, sin daño, pero es ruido:
  coordinar por el journal antes de repetir un deploy).
- Primer cron después del deploy (16:20): Makeup Mekka disparó la renovación anticipada y
  empujó un token con 60 minutos; cero `Invalid API key` desde entonces.

**La mitad del backend** — `vio-extensions-microservice`
[#9](https://github.com/vio-live/vio-extensions-microservice/pull/9)

Angelo no aceptó "robusto para operar, no por diseño" ("te dije que hiciéramos todo bien"),
así que la otra mitad quedó escrita la misma tarde:

- `VIO_CUSTOM_APPS` (JSON tienda → `{url, secret}` del app en Vercel; el secreto es el
  `CRON_SECRET` del proyecto). Para esas tiendas `asyncrefreshTokenIfApply` **no refresca
  nunca**: pide `GET /internal/token`, cachea el token en Redis hasta dos minutos antes de su
  vencimiento, actualiza `shopify_connection` de paso, y `call()` reintenta una vez ante un
  401 después de volver a pedirlo. `createWebhook` salta el registro por EventBridge para
  esas tiendas y ya no loguea "created" sobre un error. Sin la variable, todo sigue igual.
- Specs puras para los dos módulos nuevos; la suite entera no corre sin MySQL y Redis
  (lección de Miguel, abajo). Alan mergeó a `develop` a las 16:47.
- **Rollout a producción** (Miguel con Angelo, 19:00–22:30): rotación de los cuatro
  `CRON_SECRET` (estaban `sensitive` en Vercel y nadie tenía copia), `VIO_CUSTOM_APPS` en el
  blob `.env` de Azure, `develop → master`, CI verde 20:28. Todo eso está en
  [su entry](2026-09-24-extensions-apps-custom-en-prod.md); acá solo la verificación de
  Claude en los dos pods nuevos (20:28–20:45): `apps custom configuradas` con las cuatro
  tiendas en ambos; tokens tomados del app (Gladkokken 12, Makeup Mekka 1, demo 1); **0**
  `no entregó token`, **0** `Invalid API key`, **0** intentos del refresh viejo, **36**
  registros por EventBridge saltados y **0** `api_client_id`; dos filas de
  `shopify_connection` actualizadas con el token del app; sin errores de arranque.

**Tarjetas y seguimiento**

- [5Z5djEt5](https://trello.com/c/5Z5djEt5) (Dev, Alan): nació como "revisá el #107" y
  terminó como el **plan de pruebas con evidencia obligatoria**: 10 escenarios (camino
  feliz, copia vieja forzada en la base, renovación anticipada con el cron caído, webhooks,
  alta sin EventBridge, remove, orden, reinstalación en la demo, las dos réplicas,
  remedición del goteo) y un **Go/No-Go de cinco condiciones** para pedirle a Makeup Mekka
  que exporte. Angelo pidió además que Alan fuerce el app con escenarios propios.
- Tarea programada `seguimiento-pr107-alan` (cada 30 min, 8–22): la tarjeta, el código
  desplegado en los cuatro proyectos y la salud de los tokens en prod; avisa solo cuando
  algo cambia y dice "Go" cuando el Go/No-Go esté completo.

## Decisions

- La app pública sigue **aparcada hasta el 2026-10-05**.
- Villoid: no regenerar el link antes de que venza (25/09 13:42); si vence sin instalar,
  link nuevo ese día.
- Sin Slack para la auditoría; alcanza con el log y `/internal/audit`.
- **Nada de pedirle a Makeup Mekka que reexporte hasta que el Go/No-Go de Alan esté verde.**
- El deploy de Vercel lo hace Angelo (o Claude a pedido); el backend lo despliega el equipo
  por CI/CD (`develop → master`).

## Blockers / open questions

- Villoid sin instalar (0 installs en el Dev Dashboard); preguntar desde qué tienda abrieron
  el link.
- Los reintentos de Pub/Sub inflaron el volumen de webhooks: la hipótesis del stock
  (`x4L6KDhY`) hay que remedirla con los tokens sanos antes de concluir nada.
- Ruido residual en los logs de `extensions` (tarjeta `J7E6j9dM`) y el `STRIPE_WEBHOOK_SECRET`
  divergente en el blob `.env` que encontró Miguel (no es de esta sesión, pero va a saltar en
  el próximo deploy de `payment-processors`).

## Next session

- Seguir a Alan por la tarjeta; con el Go/No-Go verde, Angelo manda el mensaje a Makeup
  Mekka y Claude confirma el import del usuario 1325.
- 25/09: link nuevo a Villoid si no instalaron.
- Al dar de alta un cliente nuevo: sumar su tienda a `VIO_CUSTOM_APPS` (blob `.env` de
  Azure) además de los pasos del playbook.

## Ver también

- [Lección: robusto por diseño, no por cadencia](../../lessons/robusto-por-diseno-no-por-cadencia.md)
- [Lección: con tokens que rotan, el refresh tiene un solo dueño](../../lessons/tokens-rotados-un-solo-dueno.md)
- [Playbook: app custom por cliente](../../playbooks/shopify-app-custom-por-cliente.md)
- [Entry de Miguel: `VIO_CUSTOM_APPS` en producción](2026-09-24-extensions-apps-custom-en-prod.md),
  [`ENV_FILE_*` es el nombre del blob](../../lessons/env-file-es-el-nombre-del-blob.md),
  [la suite de Commerce necesita MySQL y Redis](../../lessons/tests-commerce-necesitan-db-local.md)
