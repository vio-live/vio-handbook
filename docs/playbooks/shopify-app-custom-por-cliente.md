---
title: "Playbook — app custom de Shopify por cliente (mientras la pública está en review)"
last-updated: 2026-09-22
owner: angelo
status: live
---

# Playbook — app custom de Shopify por cliente

Cómo onboardear a un merchant de Shopify **mientras la app pública (Vio Sync) no está
aprobada** en el App Store. Contexto y porqués:
[handoff de Vio Sync](../handoff/shopify-sync.md),
[journal 2026-09-18](../journal/2026-09/2026-09-18-vio-sync-app-custom-para-cliente.md),
[2026-09-21](../journal/2026-09/2026-09-21-vio-sync-deploy-app-cliente.md) y
[2026-09-22](../journal/2026-09/2026-09-22-vio-sync-suspension-y-app-demo.md). Detalle
pegado al código: `docs/CUSTOM-APP.md` en la rama `custom/client-app` de
`vio-live/vio-shopify-sync`.

## Por qué así (verificado contra la doc de Shopify)

- El **método de distribución es irreversible**: la app pública quedó pública, así que
  cada cliente va con **otra app**, de distribución **custom**.
- Custom: se instala con un **link que generamos**, en **una tienda** (o en las de una
  misma organización **Plus**), **sin review**, y **sin facturación de Shopify** → al
  cliente se le factura por fuera. **No hay requisito de plan**: Plus solo importa para
  instalar la misma app en varias tiendas.
- Datos protegidos de clientes (`read_orders`, webhooks de órdenes): "always available"
  en custom; en la pública requieren review.
- Un **sales channel es siempre una app pública** → la app custom no lleva canal. Por eso
  sale de la rama `custom/client-app`, que parte de `a723307` (2026-08-13), el código
  **anterior** a la conversión a Sales Channel: conecta con la API key de Vio y exporta
  productos desde la tabla de la app, directo al API de Vio.

## Registro de clientes

| Cliente | Tienda | App Shopify (id / client id) | Config (rama) | Vercel | Estado al 2026-09-22 |
|---|---|---|---|---|---|
| Villoid | `villoid.myshopify.com` | `425118728193` / `bd36f14691ec80081374e40f71ad9d72` | `shopify.app.vio-client.toml` | `vio-sync-client` → `https://vio-sync-client.vercel.app` | Verificada (healthz 200, Redis, API 2026-04). **Link mandado el 2026-09-22** con el mensaje en noruego y el video; vence el 2026-09-25 13:42. **Al 2026-09-24 sigue en 0 installs** (Dev Dashboard), aunque dijeron que instalaron: preguntar desde qué tienda abrieron el link |
| Gladkokken | `wxuxre-tf.myshopify.com` (`shop.gladkokken.no`) | `426105274369` / `a372fcbd6348fc847e4f6a547518350b` | `shopify.app.vio-client-gladkokken.toml` | `vio-sync-gladkokken` → `https://vio-sync-gladkokken.vercel.app` | Verificada el 2026-09-22 (healthz 200, secret, Redis compartido, API 2026-04; config `vio-client-gladkokken-1`). **Link mandado el 2026-09-22**; vence el 2026-09-28 13:35 |
| Makeup Mekka | `makeup-mekka.myshopify.com` (`makeupmekka.com`) | `426736517121` / `5287ee98f0381e1200754c5f16c9c914` | `shopify.app.vio-client-makeupmekka.toml` | `vio-sync-makeupmekka` → `https://vio-sync-makeupmekka.vercel.app` | Verificada el 2026-09-22 (healthz 200, secret, Redis compartido, API 2026-04; config `vio-client-makeupmekka-1`). **Instalaron el 2026-09-24 13:10 Oslo** (usuario Vio 1325, conexión Shopify 540) y conectaron a los 2 minutos; al cierre del día **sin exportar** (tildaron productos sin apretar "Export selected") |
| (demo) | `vio-demo.myshopify.com` (dev store de Vio, datos de prueba) | `426319511553` / `2f1d046a49f1322e4b0990e47da955a1` | `shopify.app.vio-client-demo.toml` | `vio-sync-demo` → `https://vio-sync-demo.vercel.app` | Para grabar el proceso de instalación (video de Angelo, 2026-09-22). Primera prueba de punta a punta contra prod. Link vence el 2026-09-29 |
| (gemela QA) | dev store de Alan | `426102554625` / `31f8416cbe5ec1d605c8dc29618636f1` | `shopify.app.vio-client-dev.toml` | — (corre local con `shopify app dev`) | Prueba de Alan OK contra staging (Trello [phMU2DP0](https://trello.com/c/phMU2DP0), Done el 2026-09-22) |

Todas en el Dev Dashboard de la organización de Vio (`222998427`; Partner org
`4993457`). Todas se llaman "Vio Sync" o parecido: identificarlas **por id**.

## Alta de un cliente nuevo

1. **Tienda**: conseguir el `.myshopify.com`. Si solo dan el dominio público, sale de
   `https://<dominio>/meta.json` (`myshopify_domain`) y se confirma con `Shopify.shop`
   en el HTML de la home. Verificarlo dos veces: el link queda atado a esa tienda.
2. **App** (Dev Dashboard → Create app → nombre "Vio Sync"): leer el client id en
   Settings. En Partner Dashboard → la app → **Distribution** → **Custom distribution**
   (irreversible) → dominio de la tienda → **Generate link**. Dejar activo *Allow
   multi-store install for one Plus organization*: **las dos opciones son irreversibles**
   y esa es la más amplia; si la tienda no es Plus, equivale a la tienda sola.
3. **Config**: copiar `shopify.app.vio-client.toml` a
   `shopify.app.vio-client-<cliente>.toml` con el client id nuevo y la URL
   `https://vio-sync-<cliente>.vercel.app`. Validar con
   `shopify app config validate --config vio-client-<cliente> --json`. Commit en la rama.
4. **Vercel** (el CLI está autenticado en `tipio-2`): en una **carpeta propia** para ese
   cliente (checkout de la rama; `git worktree add --detach <dir> vio/custom/client-app`):
   ```bash
   vercel project add vio-sync-<cliente>
   vercel link --yes --project vio-sync-<cliente>
   vercel deploy --prod --yes
   ```
   Variables Production no secretas: `SHOPIFY_API_KEY` (client id), `SHOPIFY_APP_URL`,
   `SCOPES` (las del toml), `VIO_API_HOST=https://api-ecom.vio.live`, `SHOP_DOMAIN` (la
   tienda) y `CRON_SECRET` (uno nuevo por proyecto), con
   `printf '%s' "<valor>" | vercel env add <NOMBRE> production`.
5. **Credenciales (humano)**: `SHOPIFY_API_SECRET` (Dev Dashboard → app → Settings) y el
   **Redis compartido** de las apps custom: Vercel → tipio-2 → Storage →
   `upstash-kv-orange-canvas` → Connect Project → el proyecto, Production, **prefijo
   vacío** (así crea `REDIS_URL` y `KV_URL`, que es lo que lee la app). Después,
   `vercel deploy --prod --yes` otra vez.
6. **Publicar la config en Shopify**:
   `shopify app deploy --config vio-client-<cliente> --allow-updates --version vio-client-<cliente>-1`.
   Verificar con `shopify app versions list --config vio-client-<cliente>`.
7. **Verificar**: `/healthz` 200 en la URL de producción; en `vercel logs` el arranque
   dice `Using RedisSessionStorage` y `apiVersion: '2026-04'`.
8. **Mandar el link** (Partner Dashboard → la app → Distribution) al dueño de la tienda o
   a un staff con el permiso **Applications**, con el mensaje de abajo y el video de la
   demo. El link **vence a los 7 días** de generado. En la app conectan con **su API key
   de Vio** (si no tienen cuenta en Vio, crearla antes). A ese cliente se le factura por
   fuera.

## Mensaje para el cliente (noruego)

El que se le mandó a Villoid el 2026-09-22. Reemplazar lo que está entre corchetes; la
fecha de vencimiento sale de `expires_at` en la firma del link (JSON en base64 antes del
`--`). Los nombres de pantallas y botones son los de la app, en inglés.

```text
Hei!

Her er lenken for å installere Vio Sync i Shopify-butikken deres ([BUTIKK].myshopify.com):

[LENKE]

Lenken er gyldig til [DATO] kl. [KLOKKESLETT]. Vi har også lagt ved en kort video som viser hele prosessen.

Før dere starter
- Dere trenger API-nøkkelen fra Vio-kontoen deres. Logg inn på dashboard.ecom.vio.live og gå til Settings → Integrations. Under «Store API key» klikker dere «Generate API key» (velg Shopify hvis dere blir spurt). Kopier nøkkelen med en gang: den vises bare der til butikken er koblet til.
- Den som installerer, må være eier av butikken eller ha tilgang til å installere apper i Shopify.

Slik gjør dere det
1. Logg inn i Shopify-adminen til [BUTIKK], og åpne lenken i samme nettleser.
2. Se over tillatelsene appen ber om, og klikk «Install» («Installer» hvis adminen er på norsk).
3. Appen åpnes i Shopify-adminen. Lim inn API-nøkkelen i feltet «Vio API key» og klikk «Connect».
4. Nå ser dere produktene fra Shopify i en tabell. Velg produktene dere vil selge gjennom Vio, og klikk «Export selected». Statusen endres til «Exported», og produktene vises i Vio-dashbordet.
5. Endringer dere gjør i Shopify, for eksempel pris eller tittel, oppdateres automatisk i Vio etter noen minutter.
6. Vil dere fjerne et produkt fra Vio? Velg det og klikk «Remove selected».
7. Under «Connection & log» ser dere status for tilkoblingen og en logg over det som er eksportert. Der kan dere også koble fra med «Disconnect from Vio».

Bestillinger som kommer via Vio, dukker opp i Shopify som vanlige ordrer, og dere behandler og sender dem slik dere pleier.

Har dere spørsmål? Kontakt oss på viosupport@vio.live.

Vennlig hilsen
[NAVN]
```

## Tokens: el app se los tiene que empujar a Vio

Shopify **rota** los tokens de la sesión y `vio-extensions-microservice` no los puede
renovar: su refresh usa las credenciales globales de la app pública
(`SHOPIFY_CLIENT_ID_EXPORT`), no las de la app custom del cliente, así que Shopify contesta
`401 Invalid API key or access token` y el import de productos muere (Gladkokken,
2026-09-23 → [journal](../journal/2026-09/2026-09-23-vio-sync-tokens-clientes.md)).

Desde `3439dca` el app se encarga:

- El **Home** reenvía los tokens vigentes a Vio en cada carga (`vioSyncTokens`).
- **`/internal/sync-tokens`** hace lo mismo con la **sesión offline**, sin el merchant:
  pega al Admin API para que la librería rote el token, relee la sesión y la manda.
  `?ids=1,2,3` reencola además esos productos. Protegida por `CRON_SECRET` (o
  `INTERNAL_SYNC_SECRET`): `curl -H "Authorization: Bearer <secreto>" https://<app>/internal/sync-tokens`.
- **`/internal/token`** (desde 2026-09-24, `16bbebd`): la otra mitad — devuelve el token
  vigente y su vencimiento a quien lo pida con el mismo secreto, en vez de empujarlo. Está
  para que `extensions` pueda pedirlo cuando lo necesite y Vio deje de guardar una copia;
  **hoy no la llama nadie** (Trello [u2MfJLCf](https://trello.com/c/u2MfJLCf)).
- **Cron de Vercel cada 10 minutos** contra la ruta de sync (`vercel.json`; era 30 hasta el
  PR #107). No es capricho: el token de Shopify de estas apps vive **una hora**
  (`tokenExpiresAt` en la respuesta de la ruta lo dice), y con un cron más lento Vio se
  queda con un token muerto entre corridas.
- **Renovación anticipada** (PR [#107](https://github.com/vio-live/vio-shopify-sync/pull/107),
  2026-09-24 — *en review de Alan; actualizar acá cuando esté desplegado*): empujar "lo que
  haya" no alcanzaba, porque la librería rota recién cuando el token ya venció, y entre el
  vencimiento y el siguiente cron Vio tenía un token muerto (~20 minutos por hora, medidos
  en Makeup Mekka: 401 en cadena y Pub/Sub reentregando el mismo webhook). Ahora, si a la
  sesión le quedan menos de 25 minutos, el app hace el grant `refresh_token` con las
  credenciales de *su* app, guarda la sesión nueva y esa es la que empuja (y la que entrega
  `/internal/token`).
- **`/internal/audit?shop=`** (mismo PR): últimas 50 acciones de la tienda — `connect` /
  `sync` / `remove` del merchant, reencolados y renovaciones — con ids, respuesta de Vio y
  vencimiento del token en ese momento. También salen como líneas `[vio-audit]` en los logs.
  Es la respuesta a "¿le dieron a Export?": los logs de Vercel duran menos de un día.
- El vencimiento que se manda nunca queda vacío: Vio guarda
  `Math.floor(Date.parse(expires)/1000)` y con `NaN` da el token por vencido y dispara su
  refresh roto.
- **Ruido conocido del backend**: en cada upsert de la conexión, `extensions.createExportWebhook`
  intenta registrar los webhooks con el ARN de EventBridge de la app pública
  (`api_client_id 4479607`) y Shopify responde 422 para las apps custom; el log dice
  `created` igual. No rompe nada — los webhooks de las apps custom entran por Pub/Sub,
  declarados en el `toml` — pero es de Alan (tarjeta [5Z5djEt5](https://trello.com/c/5Z5djEt5)).

Por eso cada proyecto necesita dos variables más: **`SHOP_DOMAIN`** (la tienda del cliente)
y **`CRON_SECRET`** (uno por proyecto; lo genera quien despliega).

Por qué el dueño del refresh es el app y no el backend:
[lección](../lessons/tokens-rotados-un-solo-dueno.md). Pendiente del backend:
`vio-extensions-microservice` [#8](https://github.com/vio-live/vio-extensions-microservice/pull/8)
(enmascara los secretos de los logs y no intenta refrescos imposibles) y **rotar el
`client_secret` de la app pública**, que quedó en texto plano en los logs — Trello
[XxteZiYt](https://trello.com/c/XxteZiYt).

## Cómo saber si instalaron y qué apretaron

- **Instalación**: Dev Dashboard de la org `222998427`
  (`https://dev.shopify.com/dashboard/222998427/apps`) — cada app dice "N installs". Es la
  fuente de verdad de Shopify; los logs de Vercel duran menos de un día y un cliente que
  "instaló" desde otra tienda no deja rastro en nuestro lado.
- **Conexión**: `users-ms` → `saveShopifyExportConnection … userId=<id>` con la tienda; ahí
  sale el usuario de Vio y el id de la conexión.
- **Exportación**: `GET /internal/audit` del proyecto (con `CRON_SECRET`) o, en el backend,
  `POST /api/products/shopify-sqs` en `base-api` y `importShopifyProduct to user <id>` en
  `products`. Tildar productos en el app no manda nada: la exportación es el botón **"Export
  selected"**, y termina con el toast "N products exported to Vio".

## Desplegar sin las carpetas de Angelo

Los cuatro proyectos corren el **mismo código** de `custom/client-app`; lo que cambia por
cliente son las variables de cada proyecto de Vercel. Desde cualquier máquina con acceso al
team `tipio-2`:

```bash
git clone https://github.com/vio-live/vio-shopify-sync.git && cd vio-shopify-sync
git checkout custom/client-app && npm ci && npm test
for p in vio-sync-demo vio-sync-gladkokken vio-sync-makeupmekka vio-sync-client; do
  rm -rf .vercel && vercel link --yes --scope tipio-2 --project $p && vercel deploy --prod --yes --scope tipio-2
done
```

Después de cada deploy: `healthz` → `ok`, `/internal/sync-tokens` con el `CRON_SECRET` del
proyecto → `ok:true` y `tokenExpiresAt` con más de 25 minutos, y `vercel crons ls`. Nada de
`shopify app deploy` salvo que cambie el `toml`.

## Retomar el trabajo en una sesión nueva

Las carpetas de deploy de la sesión del 2026-09-21 se borraron (vivían en un scratchpad).
La de la demo vive en `/Users/angelo/vio-deploy-demo`, enlazada a `vio-sync-demo`. Para
redesplegar a un cliente:

```bash
cd /Users/angelo/vio-sync && git fetch vio
git worktree add --detach ~/vio-deploy-<cliente> vio/custom/client-app
cd ~/vio-deploy-<cliente> && vercel link --yes --project vio-sync-<cliente>
vercel deploy --prod --yes
```

`shopify app deploy` se puede correr desde cualquier checkout de la rama (usa el
`client_id` del toml, no el link de Vercel). **Nunca** `vercel deploy` desde
`/Users/angelo/vio-sync` sin mirar a qué proyecto está enlazado: ese checkout está
enlazado a `vio-sync`, la app pública.

## Gotchas

- La variable `REDIS_URL` de la app pública es **Sensitive**: no se puede leer ni desde el
  dashboard ni con el CLI. No hace falta: ninguno de nuestros repos escribe las claves
  `LOGIN_TOKEN_*` del auto-connect, así que las apps custom usan otro Redis.
- **Las apps custom comparten un Redis** (`upstash-kv-orange-canvas`, conectado a
  `vio-sync-client` y `vio-sync-demo`): las sesiones se guardan por tienda
  (`vio_client_sessions` + `offline_<tienda>`) y cada app custom está atada a una tienda
  distinta. Si al conectarlo Vercel le pone prefijo (en Villoid quedó `viosyncclient_`),
  hay que crear además `REDIS_URL` con el mismo valor.
- **Un despliegue por app**: el servidor arranca con el client id, el secret y la URL de
  una sola app, así que dos apps no pueden compartir un proyecto de Vercel sin cambiar la
  autenticación.
- **Los links de instalación vencen a los 7 días**
  ([doc de Shopify](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method)).
  El de Villoid, generado el 2026-09-18, vence el 2026-09-25.
- Con más de **1.000 listings** en la cuenta de Vio, "Connection & log" no muestra los
  logs: `listings` pide `size=1000` (`app/lib/vioEndpoints.ts`). Observación de Alan,
  2026-09-21.
- Las **órdenes no llegan a Shopify si el mismo usuario de Vio es proveedor y vendedor**;
  con usuarios separados funciona (Alan, 2026-09-21). Para probar órdenes, el vendedor
  tiene que ser otra cuenta.
- La gemela (`vio-client-dev`) prueba contra **staging**: su topic de Pub/Sub tiene que ser
  `pubsub://tipio-staging-development:vio-sync-staging`. Las apps de clientes usan
  `vio-sync`, el de prod, igual que la app pública.
- El campo "Vio API key" de la app muestra la key **en texto plano**: si se graba un
  video, usar una cuenta de Vio de prueba y rotar la key después, o difuminarla.
- El código de agosto traía Admin API **2025-10**, que deja de estar disponible el
  **16-oct-2026**. La rama ya usa **2026-04** (válida hasta abril de 2027; las 6
  operaciones GraphQL validadas contra ese esquema).
- `curl` contra la app devuelve **410**: es el filtro anti-bots de la librería de Shopify.
  Con user-agent de navegador responde 302 al login. No es un error.
- Proyecto de Vercel nuevo creado por CLI arranca con preset **"Other"** (serviría
  estáticos): la rama trae `vercel.json` con `framework: react-router`.
- `shopify app deploy` imprime al final un `EACCES` de su autoactualización: no afecta al
  deploy (verificar con `versions list`).
- Instalar dependencias en la rama exige **Node ≥ 22.18**.
- **Sin integración con Git** en los proyectos de Vercel de clientes: si se conectara, la
  rama de producción por defecto sería `master` (la app pública).

## Cuando aprueben la app pública

Nada de esto hace falta para clientes nuevos. Los existentes migran: desinstalar la app
custom → instalar la pública → elegir plan → pasan a pagar por Shopify. Su cuenta de Vio y
sus productos no cambian. Después se pueden borrar las apps custom y sus proyectos de
Vercel, y la rama `custom/client-app`.
