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
| Villoid | `villoid.myshopify.com` | `425118728193` / `bd36f14691ec80081374e40f71ad9d72` | `shopify.app.vio-client.toml` | `vio-sync-client` → `https://vio-sync-client.vercel.app` | Verificada (healthz 200, Redis, API 2026-04). **Link mandado el 2026-09-22** con el mensaje en noruego y el video; vence el 2026-09-25 13:42 |
| Gladkokken | `wxuxre-tf.myshopify.com` (`shop.gladkokken.no`) | `426105274369` / `a372fcbd6348fc847e4f6a547518350b` | `shopify.app.vio-client-gladkokken.toml` | `vio-sync-gladkokken` → `https://vio-sync-gladkokken.vercel.app` | Verificada el 2026-09-22 (healthz 200, secret, Redis compartido, API 2026-04; config `vio-client-gladkokken-1`). **Link mandado el 2026-09-22**; vence el 2026-09-28 13:35 |
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
   `SCOPES` (las del toml), `VIO_API_HOST=https://api-ecom.vio.live`, con
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
