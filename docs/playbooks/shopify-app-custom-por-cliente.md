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

| Cliente | Tienda | App Shopify (id / client id) | Config (rama) | Vercel | Estado (último dato) |
|---|---|---|---|---|---|
| Villoid | `villoid.myshopify.com` | **`438624845825` / `3ced68df11709eceb7ecb322fa7f0e99`** (desde 2026-10-22). La primera, `425118728193` / `bd36f14691ec80081374e40f71ad9d72`, queda **retirada**: su link venció sin usarse y no se puede regenerar | `shopify.app.vio-client-villoid.toml` ([#128](https://github.com/vio-live/vio-shopify-sync/pull/128)); la vieja, `shopify.app.vio-client.toml`, no se despliega más | `vio-sync-client` → `https://vio-sync-client.vercel.app` (el mismo deploy para las dos apps) | App nueva creada y verificada el 2026-10-22 (config `vio-client-villoid-1`, secret comprobado con webhook firmado, 409 `no_session` desde `extensions`). **Link mandado el 2026-10-22**, con la key de la cuenta Vio **1323** (variante con key); vence el **2026-10-29 13:18** Oslo |
| Gladkokken | `wxuxre-tf.myshopify.com` (`shop.gladkokken.no`) | `426105274369` / `a372fcbd6348fc847e4f6a547518350b` | `shopify.app.vio-client-gladkokken.toml` | `vio-sync-gladkokken` → `https://vio-sync-gladkokken.vercel.app` | Verificada el 2026-09-22 (config `vio-client-gladkokken-1`). Instalada y exportando: cuenta Vio **1324**; `/internal/token` 200 y pushes de token sin errores al 2026-10-22 |
| Makeup Mekka | `makeup-mekka.myshopify.com` (`makeupmekka.com`) | `426736517121` / `5287ee98f0381e1200754c5f16c9c914` | `shopify.app.vio-client-makeupmekka.toml` | `vio-sync-makeupmekka` → `https://vio-sync-makeupmekka.vercel.app` | Verificada el 2026-09-22 (healthz 200, secret, Redis compartido, API 2026-04; config `vio-client-makeupmekka-1`). **Instalaron el 2026-09-24 13:10 Oslo** (usuario Vio 1325, conexión Shopify 540) y conectaron a los 2 minutos; sus dos calendarios de adviento entraron a Vio sin pasar por "Export selected" (casi seguro publicándolos al canal desde el admin de Shopify) |
| Careless | `dignitycollect.myshopify.com` (`careless.no`) | `434547228673` / `dd30cfd709d3f09dbdec6c81674f350c` | `shopify.app.vio-client-careless.toml` | `vio-sync-careless` → `https://vio-sync-careless.vercel.app` | Creada el 2026-10-12 (config `vio-client-careless-1`, cuenta Vio **1327**). **Instalada el 2026-10-16 10:49, conectada 13:58** (Oslo), 20/20 productos SUCCESS; exportando al 2026-10-22 |
| (demo) | `vio-demo.myshopify.com` (dev store de Vio, datos de prueba) | `426319511553` / `2f1d046a49f1322e4b0990e47da955a1` | `shopify.app.vio-client-demo.toml` | `vio-sync-demo` → `https://vio-sync-demo.vercel.app` | Para grabar el proceso de instalación (video de Angelo, 2026-09-22). Primera prueba de punta a punta contra prod. Link vence el 2026-09-29 |
| (gemela QA) | dev store de Alan | `426102554625` / `31f8416cbe5ec1d605c8dc29618636f1` | `shopify.app.vio-client-dev.toml` | — (corre local con `shopify app dev`) | Prueba de Alan OK contra staging (Trello [phMU2DP0](https://trello.com/c/phMU2DP0), Done el 2026-09-22) |

Todas en el Dev Dashboard de la organización de Vio (`222998427`; Partner org
`4993457`). Todas se llaman "Vio Sync" o parecido: identificarlas **por id**.

## Alta de un cliente nuevo

1. **Tienda**: conseguir el `.myshopify.com`. Si solo dan el dominio público, sale de
   `https://<dominio>/meta.json` (`myshopify_domain`) y se confirma con `Shopify.shop`
   en el HTML de la home. Verificarlo dos veces: el link queda atado a esa tienda.
2. **App** (Dev Dashboard → Create app → **Create app manually** → nombre "Vio Sync" →
   Create app → Release; URLs y scopes da igual, los pisa el paso 6): leer el client id en
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
   tienda), con `printf '%s' "<valor>" | vercel env add <NOMBRE> production`. El
   `CRON_SECRET` va en el paso 8, junto con `VIO_CUSTOM_APPS`: el mismo valor en los dos
   lados. Hasta tener el secret, la app da 500 (`apiSecretKey: MISSING`): es lo esperado.
5. **Credenciales (humano)**: `SHOPIFY_API_SECRET` (Dev Dashboard → app → Settings) y el
   **Redis compartido** de las apps custom: Vercel → tipio-2 → Storage →
   `upstash-kv-orange-canvas` → Connect Project → el proyecto, Production, **prefijo
   vacío** (así crea `REDIS_URL` y `KV_URL`, que es lo que lee la app). Después,
   `vercel deploy --prod --yes` otra vez.
6. **Publicar la config en Shopify**:
   `shopify app deploy --config vio-client-<cliente> --allow-updates --version vio-client-<cliente>-1`.
   Verificar con `shopify app versions list --config vio-client-<cliente>`. **Solo después
   de fijar la distribución custom (paso 2)**: antes, Shopify rechaza la versión con
   *"This app is not approved to subscribe to webhook topics containing protected customer
   data"* por los webhooks de órdenes (2026-10-12, Careless).
7. **Verificar**: `/healthz` 200 en la URL de producción; en `vercel logs` el arranque
   dice `Using RedisSessionStorage` y `apiVersion: '2026-04'`.
8. **`CRON_SECRET` + `VIO_CUSTOM_APPS`** (Miguel; él guarda los secretos): generar un
   `CRON_SECRET` nuevo, cargarlo en el proyecto de Vercel (Production, *sensitive*),
   agregar `"<tienda>":{"url":"https://vio-sync-<cliente>.vercel.app","secret":"<ese
   secreto>"}` a `VIO_CUSTOM_APPS` de `extensions` en prod y reciclar sus pods (ver
   "dónde vive" en la sección de tokens). Redeploy de la app. Comprobación sin ver ningún
   secreto, desde un pod de `extensions` (node lee el mapa del `.env` y llama a
   `/internal/token` de cada app): **200** = instalada y secreto correcto, **409
   `no_session`** = secreto correcto pero la tienda todavía no instaló, **401** = el secreto
   no coincide.
9. **Caminar el flujo antes del link**: exportar un producto desde la tienda demo y ver en
   `products` `importShopifyProduct to user 1322 … SUCCESS` (el 2026-10-12 tardó 1,5 s del
   clic al producto). Si prod estuvo apagado, esperar a que drene el backlog de webhooks
   (ver Gotchas).
10. **Mandar el link** (Partner Dashboard → la app → Distribution) al dueño de la tienda o
   a un staff con el permiso **Applications**, con el mensaje de abajo y el video de la
   demo. El link **vence a los 7 días** de generado y **no se puede regenerar**: generarlo el mismo día que el cliente va a instalar (si vence, ver «Si el link vence sin instalar»). En la app conectan con **su API key
   de Vio** (si no tienen cuenta en Vio, crearla antes; si la crea Angelo, la key va en el
   mensaje — usar la variante de abajo). A ese cliente se le factura por
   fuera.

## Mensaje para el cliente (noruego)

El que se le mandó a Villoid el 2026-09-22 (y de nuevo el 2026-10-22, en la variante con la key), con el paso 4 reforzado después de Makeup
Mekka (tildaron sin apretar el botón). **Si la cuenta de Vio la creó Angelo**, el primer
punto de "Før dere starter" se reemplaza por: «API-nøkkelen til Vio-kontoen deres er:
[API-NØKKEL] — den limer dere inn i appen etter installasjonen (se punkt 3).» La key la
pega Angelo, no se escribe en el handbook ni en el chat. Reemplazar lo que está entre corchetes; la
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
4. Nå ser dere produktene fra Shopify i en tabell. Kryss av for produktene dere vil selge gjennom Vio, og klikk «Export selected» øverst til høyre. Det er knappen som sender dem: bare å krysse av er ikke nok. Dere får en bekreftelse («N products exported to Vio»), og produktene vises i Vio-dashbordet.
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
  vigente y su vencimiento a quien lo pida con el mismo secreto, en vez de empujarlo. La
  llama `extensions` para las tiendas de `VIO_CUSTOM_APPS`
  ([PR #9](https://github.com/vio-live/vio-extensions-microservice/pull/9), **en producción
  desde el 2026-09-24 20:28**): JSON tienda → `{url, secret}` en el `.env` del
  microservicio. **Dónde vive hoy (cluster de Suecia, desde el 29/09)**: los pods leen el
  Secret de Kubernetes **`env-sc-extensions`**, montado sobre `/usr/src/app/.env`, que tapa
  al `.env` horneado en la imagen. Para cambiarlo: respaldo del Secret, editarlo, y
  reciclar los pods de a uno (no hace falta rebuild). El blob `.env` de
  `containerproductionsc` / `env-file-microservices` se actualiza igual, para que un
  rebuild no lo pise (snapshot primero). Antes de la mudanza el blob era la fuente:
  [lección de Miguel](../lessons/env-file-es-el-nombre-del-blob.md). El
  secreto de cada tienda es el `CRON_SECRET` de su proyecto de Vercel; los cuatro se rotaron
  el 2026-09-24 y las copias viven en el `TOOLS.md` del workspace de Miguel. Si se rotan de
  nuevo: primero redeploy de la app en Vercel, después el Secret (y el blob), en ese orden. Con eso el backend no
  refresca nunca esas conexiones: pide el token, lo cachea en Redis hasta dos minutos antes
  de vencer y reintenta una vez ante un 401. **Al dar de alta un cliente nuevo hay que
  agregar su tienda a `VIO_CUSTOM_APPS`** (o queda en el modelo de copia empujada, que
  funciona pero depende del cron).
- **Cron de Vercel cada 10 minutos** contra la ruta de sync (`vercel.json`; era 30 hasta el
  PR #107). No es capricho: el token de Shopify de estas apps vive **una hora**
  (`tokenExpiresAt` en la respuesta de la ruta lo dice), y con un cron más lento Vio se
  queda con un token muerto entre corridas.
- **Renovación anticipada** (PR [#107](https://github.com/vio-live/vio-shopify-sync/pull/107),
  mergeado por Alan y **desplegado en los cuatro proyectos el 2026-09-24 a las 16:10**;
  primer cron: Makeup Mekka renovada con 60 minutos de vida, cero 401): empujar "lo que
  haya" no alcanzaba, porque la librería rota recién cuando el token ya venció, y entre el
  vencimiento y el siguiente cron Vio tenía un token muerto (~20 minutos por hora, medidos
  en Makeup Mekka: 401 en cadena y Pub/Sub reentregando el mismo webhook). Ahora, si a la
  sesión le quedan menos de 35 minutos (25 hasta el PR #108), el app hace el grant `refresh_token` con las
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
  sale el usuario de Vio y el id de la conexión. **Ojo con `kubectl logs deploy/<svc>`: lee
  una sola réplica.** `users`, `extensions` y `products` corren con varias; para no perder
  líneas hay que recorrer los pods (`kubectl get pods -n default | grep '^users-'`) o usar
  `base-api`, que registra `CALL OK POST to http://users/me/<userId>/sales-channel/create`
  en cada push.
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

Carpetas de deploy enlazadas hoy: `~/vio-deploy-{demo,gladkokken,makeupmekka,villoid,careless}`.
Para mirar prod: el cluster es **`vio-commerce-prod-sc`** (Suecia); el contexto viejo
`vio-commerce-prod` apunta a Noruega, que ya no existe. Credenciales:
`az aks get-credentials -g rg-vio-commerce-prod-sc -n vio-commerce-prod-sc --context vio-commerce-prod-sc`
(cambia el contexto actual: pasar siempre `--context`).

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
- **Los links de instalación vencen a los 7 días y no se regeneran**
  ([ayuda de Shopify](https://help.shopify.com/en/manual/apps/install-setup-apps)). Partners
  (Distribution) sigue mostrando el link vencido con un botón de copiar y nada más; el Dev
  Dashboard no tiene página de distribución propia y el CLI no tiene comando. Abrir el link
  vencido no lo aclara: Shopify primero pide la tienda y valida la organización
  (`invalid_link_organization` con una tienda ajena). Comprobado el 2026-10-22 con el de
  Villoid (generado el 2026-09-18, vencido el 2026-09-25). Salida: la sección siguiente.
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

- **Después de tener prod apagado, `extensions` se atasca drenando webhooks** (2026-10-12,
  tras una semana apagado: ~79.000 mensajes en `vio-sync-sub`). Todas sus llamadas a
  Shopify pasan por un limitador de 2 por segundo por pod, así que `getShopInfo` y
  `findProductById` llegan a tardar de 30 s a 10 min. `users-ms` corta a los 30 s, así que
  **los push de tokens dan 417 y cualquier connect nuevo falla** hasta que drene (no se
  pierde nada: `extensions` igual pide el token al app). Señal: en `users-ms`,
  `POST /me/<id>/sales-channel/create 417 30000ms`. Medir el backlog con
  `num_undelivered_messages` (receta en el journal de Miguel del 12/10). No mandar links ni
  hacer onboardings hasta que los push vuelvan a responder 200 en pocos segundos.

## Si el link vence sin instalar (Villoid, 2026-10-22)

App nueva para la misma tienda **reusando el deploy de Vercel**: misma URL, Redis y
`CRON_SECRET`, así que la entrada de `VIO_CUSTOM_APPS` en `extensions` no cambia y no hace
falta Miguel. Unos 30-40 minutos:

1. Dev Dashboard → Create app → Create app manually → «Vio Sync», App URL y redirect del
   deploy existente → Create app → Release. Client id en Overview → Credentials.
2. Partners → la app nueva → Distribution → **Custom distribution** → la misma tienda,
   multi-store marcado → **Generate link** (irreversible; el link corre desde ahora).
3. Toml nuevo `shopify.app.vio-client-<cliente>.toml` con el client id nuevo (copia del
   anterior; el viejo se marca como retirado en el comentario). Comprobar el id con
   `shopify app versions list --config <nuevo>` (tiene que listar `vio-sync-1`) y publicar:
   `shopify app deploy --config <nuevo> --allow-updates --no-build --version <nuevo>-1`.
   Comparar con `shopify app config pull` (solo cambia el formato; restaurar el archivo).
4. **Humano**: en el proyecto de Vercel, `SHOPIFY_API_KEY` y `SHOPIFY_API_SECRET` de la
   app nueva, y Redeploy de producción. (El clasificador bloquea al agente escribir y leer
   esas variables, y `vercel env pull` falla con *Production Project Environment Variable
   not found* en estos proyectos.)
5. Verificar sin ver ningún secreto:
   - client id: `curl -sI https://<app>/auth/login?shop=<tienda>` redirige a
     `admin.shopify.com/store/<tienda>/oauth/install?client_id=<nuevo>`;
   - secret: `shopify app webhook trigger --config <nuevo> --topic customers/data_request
     --api-version 2026-10 --delivery-method http --address https://<app>/webhooks/customers/data_request`
     y mirar `vercel logs <app> --scope tipio-2` (empezar a mirar antes de disparar): **200
     «Received»** = la firma valida con el secret; 401 = no coincide. Esa ruta solo valida y
     responde, no toca datos;
   - `extensions`: el chequeo de `/internal/token` del paso 8 sigue en 409 `no_session`.
6. Decodificar el link (JSON en base64 antes del `--`): `permanent_domain`, `client_id`
   nuevo y `expires_at`. Mandarlo ese mismo día.

## Cuando aprueben la app pública

Nada de esto hace falta para clientes nuevos. Los existentes migran: desinstalar la app
custom → instalar la pública → elegir plan → pasan a pagar por Shopify. Su cuenta de Vio y
sus productos no cambian. Después se pueden borrar las apps custom y sus proyectos de
Vercel, y la rama `custom/client-app`.

## Desplegar la configuración de un app sin llevarse nada por delante (21/10)

> [claude, 2026-10-21] Antes de un `shopify app deploy` (de cliente o público):
> 1. **Comparar lo activo con el repo**: `shopify app config pull --config <toml>` sobre un checkout desechable y comparar
>    webhooks y scopes con el `toml` del repo. Ojo: la privacidad (GDPR) puede estar en `[webhooks.privacy_compliance]`
>    o como `compliance_topics`; las dos formas son lo mismo y no se pueden mezclar (el CLI lo rechaza).
> 2. **Si el CLI pide `--allow-deletes`**, no forzar a ciegas: crear la versión con `--no-release` y leer el resumen de
>    `shopify app release --version=<v>` (es interactivo: lanzarlo en una terminal y cancelar con Ctrl-C si no se quiere
>    publicar todavía). El 21/10 el único «borrado» de `Vio Sync`/`Vio Sync Staging` era el módulo `events` declarado vacío
>    (apaño del bug del CLI de agosto); se publicó.
> 3. Los clientes reales usan sus apps propias (rama `custom/client-app`), no `Vio Sync`. Estado 21/10: todas con
>    `refunds/create`; activo = repo comprobado en Careless, Gladkokken y Makeupmekka.
> Un `deploy`/`release` con `--allow-deletes` lo lanza una persona: el control de seguridad de los agentes lo bloquea.
