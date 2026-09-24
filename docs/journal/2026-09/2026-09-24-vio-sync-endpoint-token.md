---
date: 2026-09-24
session: vio-sync-endpoint-token
participants: [angelo, claude]
status: live
---

# Session — 2026-09-24 — La noche aguantó, tarjetas al día y la mitad del app del rediseño

## Goal

Status de la mañana después del arreglo de tokens, dejar las tarjetas de Alan reflejando
la realidad, y preparar la parte del app del rediseño del token.

## Done

**Status de la noche**: el cron corrió **24 veces en 12 h** (cada 30 minutos), **cero 401**
de Shopify y Gladkokken siguió importando; la última llamada a su tienda fue un 200. Villoid
y Makeup Mekka **siguen sin instalar** (cero señales en 20 h). Decisión de Angelo: no
regenerar el link de Villoid antes de tiempo — Michael los está empujando, y si vence el
2026-09-25 13:42 se manda uno nuevo ese día.

**Alan cerró su tarjeta** ([XxteZiYt](https://trello.com/c/XxteZiYt), Done, 17/17): mergeó y
desplegó el PR #8, lo probó forzando `expires_in = null` en una cuenta de prueba, y votó por
**quedarse con la heurística** — sin bandera ni migración, porque las apps custom son
temporales. Coincide con lo que habíamos propuesto.

**Tarjetas al día**, para que tenga el cuadro completo de lo que pasó mientras no estaba:
- Comentario de cierre en `XxteZiYt` separando lo hecho, lo decidido y lo que sigue abierto.
- [J7E6j9dM](https://trello.com/c/J7E6j9dM): los logs de `extensions` siguen imprimiendo
  tokens de las tiendas por tres vías que el PR #8 no tocaba (queries de TypeORM,
  `graphGetProductById`/`getVariant`, dump de `getEcomUser`). No urgente: esos tokens
  caducan solos a los ~50 minutos.
- [u2MfJLCf](https://trello.com/c/u2MfJLCf): el rediseño del token, **preparar sin
  desplegar**, con la implementación sin migración (mapa tienda → app en variables de
  entorno de `extensions` + caché corto en Redis).
- [x4L6KDhY](https://trello.com/c/x4L6KDhY): la hipótesis del stock quedó anotada; Angelo
  la aparca por ahora.

**La mitad del app del rediseño** (`16bbebd`, desplegado en los cuatro proyectos):
`GET /internal/token` devuelve el token vigente ya rotado y su vencimiento, con el mismo
secreto que la ruta de sync. Es **aditiva**: nadie la llama hasta que `extensions` la use,
así que no toca a los clientes. Las guardas y la lectura de la sesión offline quedaron
compartidas entre las dos rutas. 205 tests, 100 % de cobertura, typecheck, lint y build
limpios. Verificada en prod: sin credencial 401; con el secreto devuelve el token y su
vencimiento (~45 minutos por delante).

## Decisions

- La app pública queda **aparcada hasta el 2026-10-05**; no se retoma el tema hasta entonces.
- Prioridad del día: que los clientes instalen y sientan que funciona. Si algo falla, se
  recuperan los productos con `?ids=` como se hizo con Gladkokken.
- El rediseño del token se **prepara**, no se despliega, hasta decidir la ventana.

## Blockers / open questions

- Villoid y Makeup Mekka sin instalar; el link de Villoid vence el 2026-09-25 13:42.
- La mitad de `extensions` del rediseño depende de Alan y de cuándo puedan desplegar.

## Next session

- Si Villoid no instaló, generar link nuevo el 25.
- Retomar la hipótesis del stock y el ahorro de webhooks cuando Angelo lo pida.

---

## Tarde — Makeup Mekka instaló, "exportaron dos productos" que nunca salieron, y el arreglo completo

### Lo que pasó

- **Makeup Mekka instaló** a las 13:10 Oslo (usuario Vio **1325**, conexión Shopify **540**) y
  conectó a las 13:12. Toda su sesión con el app duró 1 min 54 s y terminó en el connect.
- A las 14:00 dijeron que habían "exportado dos productos de prueba". **No llegó nada**: cero
  POST de sync en el app, cero llamadas a `POST /api/products/shopify-sqs` en `base-api` (de
  cualquier tienda, en 8 h), cero `importShopifyProduct` para 1325, y sus webhooks
  `products/update` terminaban todos en `Product with origin … not found`. Tampoco había
  nada en el bus: Azure Service Bus (`az servicebus queue list`) con **0 activas, 0 en DLQ**
  en producto y en órdenes. Lo más probable, dado el UI: **tildaron dos productos** (solo
  cliente) y no apretaron **"Export selected"** (el POST que nunca existió); si lo hubieran
  apretado habrían visto el toast "2 products exported to Vio" o un error. Angelo les mandó
  las instrucciones en noruego.
- **Villoid dijo que instaló y no instaló**: el Dev Dashboard de la org (`222998427`) marca
  **0 installs** para `vio-client-1`, contra 1 de cada una de las otras tres apps; el
  proyecto de Vercel solo recibió crons en 24 h. Lección práctica: para saber si una tienda
  instaló, mirar "N installs" en el Dev Dashboard, no rastrear logs. Hipótesis: abrieron el
  link desde otra tienda (el link custom está atado a `villoid.myshopify.com`).

### Lo que apareció buscando eso

1. **El agujero del token, medido.** El token de Makeup Mekka venció a las 14:10:56 y el cron
   lo repuso a las 14:30:16. En esa ventana, cada webhook de su tienda falló con
   `401 Invalid API key`, y como en `extensions` el error del refresh sube, **Pub/Sub
   reentregó el mismo mensaje una y otra vez**: la orden `7199057707139` llegó 12 veces en
   un minuto; 75 `orders/fulfilled` para 11 órdenes; 577 `products/update` para 85
   productos. Desde el push de las 14:30, cero 401. Consecuencia: **buena parte del "goteo"
   de webhooks que atribuíamos a un ERP o al stock son reintentos por fallo**; hay que
   volver a medirlo con los tokens sanos antes de concluir nada (`x4L6KDhY`).
2. **Un bug viejo del backend**: en cada upsert de la conexión (`saveShopifyExportConnection`
   → `createExportWebhook`), `extensions` intenta registrar los webhooks de la tienda con el
   ARN de EventBridge **de la app pública** (`aws.partner/shopify.com/4479607/webhooks-export-prod`)
   y Shopify responde `422 "is an AWS ARN and includes api_client_id '4479607' instead of
   '426736517121'"` para las apps custom; el código loguea `Webhook products/update created`
   igual. No rompe nada (los webhooks de las apps custom entran por Pub/Sub, declarados en
   el `toml`), pero son 4 llamadas fallidas por tienda en cada push y un log que miente.
3. **Lo conocido, verificado uno por uno**: el lock de Redis del refresh (julio, `pmsXD6wr`)
   ya es atómico con TTL — descartado; `expires` NaN — descartado (el app manda fecha real);
   la key de otro usuario en el dashboard — arreglada en prod; cola/DLQ — vacías. Quedaba un
   solo problema real: el token.

### El arreglo — PR [#107](https://github.com/vio-live/vio-shopify-sync/pull/107) (`feature/token-anticipado-y-auditoria` → `custom/client-app`)

Regla de Angelo: son clientes reales, la instalación actual se mantiene, y antes de pedirles
que reexporten, Alan revisa y probamos el flujo completo nosotros.

- **Renovación anticipada**: si a la sesión offline le quedan menos de 25 minutos, el app
  hace el grant `refresh_token` contra Shopify con las credenciales de *su* app, guarda la
  sesión nueva (`sessionStorage.storeSession`) y esa es la que empuja a Vio y la que entrega
  `GET /internal/token`. Si Shopify no lo da, sigue con la que había y queda auditado.
- **Cron cada 10 minutos** (antes 30). Con el umbral de 25, Vio nunca tiene un token con
  menos de ~15 minutos de vida.
- **Auditoría**: cada `connect` / `sync` / `remove` del merchant, cada reencolado y cada
  renovación queda en una línea `[vio-audit] {…}` y en una lista en Redis por tienda
  (últimas 50), con ids, respuesta de Vio y vencimiento del token en ese momento.
  `GET /internal/audit?shop=` (mismo secreto) la devuelve. Angelo descartó el aviso a Slack.
- Sin variables nuevas, sin `shopify app deploy`: solo `vercel deploy --prod` en los cuatro
  proyectos. 240 tests, cobertura 100 %, typecheck, lint y build limpios.
- Tarjeta de review para Alan: [5Z5djEt5](https://trello.com/c/5Z5djEt5) (Dev/To do), con
  los dos puntos del backend que siguen siendo suyos: pedir el token a `/internal/token`
  (`u2MfJLCf`) y no registrar por EventBridge en apps custom (el 422).

### Secuencia acordada

1. Alan revisa y aprueba el PR #107.
2. **Alan mergea y despliega los cuatro proyectos** (decisión de Angelo: "que Alan tome mi
   parte también"): clon limpio de `custom/client-app`, `vercel link` a cada proyecto y
   `vercel deploy --prod`; los pasos exactos y la verificación están en la tarjeta
   [5Z5djEt5](https://trello.com/c/5Z5djEt5). Prerrequisito: acceso al team de Vercel
   `tipio-2`, que Angelo tiene que confirmar o darle.
3. Alan prueba el export completo en la tienda demo (`vio-demo`, usuario Vio 1322): dos
   productos → "Export selected" → `importShopifyProduct to user 1322`, cero 401, DLQ vacía,
   y la acción visible en `/internal/audit`. Si no tiene acceso a la tienda, el click lo da
   Angelo.
4. Recién ahí se le pide a Makeup Mekka que vuelva a exportar.

### Pendientes

- Villoid: el link vence el 25 a las 13:42; si no instalaron, link nuevo ese día. Preguntar
  desde qué tienda lo abrieron.
- Remedir el volumen de webhooks de Gladkokken y Makeup Mekka con los tokens sanos, antes de
  la hipótesis del stock.
