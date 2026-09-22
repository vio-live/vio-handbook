---
date: 2026-09-22
session: vio-sync-suspension-y-app-demo (2026-09-21 → 2026-09-22)
participants: [angelo, claude]
status: live
---

# Session — 2026-09-21 → 09-22 — Shopify suspende la cuarta submission; app de demo y link a Villoid

## Goal

Entender la respuesta de Shopify a la cuarta submission y qué hacer con ella. Mientras
tanto, dejar lista una app custom de demo para que Angelo grabe el proceso de instalación,
y mandarle el link a Villoid.

## Done

**La respuesta de Shopify (mail del 2026-09-21)**

- Submission **suspendida hasta el 2026-10-05** ("Multiple failures to resolve a core
  requirement issue"; casi seguro por el 1.2.1, que ya había pausado la tercera). Recién
  desde esa fecha se puede reenviar desde el Partner Dashboard.
- Findings:
  - **1.2.1**: vieron Billing de Shopify **y** cobro por fuera (screencasts 1 y 2).
  - **Marketplace**: "Shopify is not currently accepting apps that connect to a
    marketplace system outside of Shopify".
  - **4.5.3**: el screencast no alcanza para configurar y probar la app; tiene que ser
    paso a paso, en inglés o con subtítulos.
- Los screencasts del reviewer **no se vieron**: el conector de Gmail pide más permisos
  para leer el mail.

**Análisis del punto del marketplace** (contra la doc oficial, 2026-09-21)

- No es un requisito numerado de los
  [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements):
  es la frase del 1.1.8 (POS) con "marketplace" en su lugar, la misma con la que Shopify
  rechaza conectores de eBay. En el
  [foro de devs](https://community.shopify.dev/t/my-app-was-rejected-because-shopify-considers-it-a-marketplace-connector/35502)
  un empleado de Shopify la define como apps que mandan el catálogo del merchant a un
  marketplace externo.
- El 1.1.6 dice que los marketplaces deben ser sales channels, y Vio Sync lo es. Pero la
  [doc de sales channels](https://shopify.dev/docs/apps/build/sales-channels) exige ser
  dueño y operar la superficie donde se vende (o estar contratado para representarla), y
  solo documenta checkouts de Shopify (cart permalinks o Storefront API).
  `merchantOfRecord = "channel"` existe en la spec (los ejemplos son Amazon y Walmart),
  pero no hay camino documentado para que un canal nuevo lo use.
- Inferido, sin confirmar: el reviewer ve a Vio como un sistema externo que toma el
  catálogo, lo vende en superficies de terceros y cobra con su propio checkout. Nuestras
  testing instructions lo dicen así ("Vio's Nordic commerce network", "Vio as merchant of
  record", "no public marketplace URL"). La confirmación con Shopify del 2026-08-21 no
  obligó al equipo de review.

**Dónde pudo ver cobro por fuera** (verificado en código y páginas públicas; no se sabe
cuál vio)

- Dashboard de Vio (`webapp-vio-commerce`, develop): la ficha de producto exige
  "Commission" de 1 a 100 % ("What the selling channel keeps"), el detalle de orden
  muestra "Channel cut" y "You net", y el Home tiene el panel de payouts a publishers.
  Nada de eso pasa por `useShopifyManaged`, que solo esconde Plan & billing, "Upgrade now"
  y "Vio fee". Además contradice el "Vio doesn't charge any commission on your sales" del
  app (5.7.6).
- El link a Terms del footer del app lleva a vio.live/terms ("fees as described on our
  pricing page") y de ahí a vio.live/pricing, con planes Starter/Pro/Enterprise por fuera
  de Shopify.
- El gate de Plan & billing depende de señales que una cuenta nueva, abierta en otro
  navegador, puede no tener.

**Apps custom**

- **Prueba de Alan OK** (Trello [phMU2DP0](https://trello.com/c/phMU2DP0), pasada a Done
  el 2026-09-22), hecha contra **staging**. Sus observaciones:
  - con más de 1.000 listings en la cuenta de Vio, "Connection & log" no muestra los
    logs (`listings` pide `size=1000`, `app/lib/vioEndpoints.ts`);
  - el toml de la gemela tiene que usar el topic `vio-sync-staging` para probar contra
    staging (las apps de clientes usan `vio-sync`, el de prod);
  - las órdenes no llegan a Shopify si el mismo usuario de Vio es proveedor y vendedor.
- **App de demo** para que Angelo grabe el proceso: dev store `vio-demo.myshopify.com`
  (con los datos de prueba de Shopify), app `426319511553`, Vercel `vio-sync-demo`, config
  `vio-client-demo-1`
  ([`d63570d`](https://github.com/vio-live/vio-shopify-sync/commit/d63570d) en
  `custom/client-app`). Es la primera prueba de punta a punta contra **prod**: instalación
  y conexión sin errores en los logs. Angelo instaló y grabó el video él mismo.
- **Redis compartido**: `upstash-kv-orange-canvas` (el de Villoid) quedó conectado también
  a `vio-sync-demo`. Las sesiones son por tienda y cada app custom está atada a una tienda
  distinta, así que no chocan.
- **Villoid**: link, versión de Shopify, deploy y arranque verificados; Angelo mandó el
  link el 2026-09-22 con instrucciones en noruego y el video. El link **vence el
  2026-09-25 a las 13:42**: los links de instalación custom duran 7 días.
- **Gladkokken**: Angelo cargó `SHOPIFY_API_SECRET`, conectó el Redis compartido y
  redesplegó `vio-sync-gladkokken`. Verificado: `/healthz` 200 (antes 500), sesiones en
  Redis, secret presente, API 2026-04. Angelo mandó el link el mismo día; vence el
  2026-09-28 a las 13:35.
- **Makeup Mekka** (cliente nuevo, `makeup-mekka.myshopify.com`, verificado con `meta.json`
  y `Shopify.shop`): app `426736517121`, link generado (vence el 2026-09-29 18:39),
  config `vio-client-makeupmekka-1` publicada
  ([`a579026`](https://github.com/vio-live/vio-shopify-sync/commit/a579026)), Vercel
  `vio-sync-makeupmekka` con las 4 variables no secretas. Angelo cargó el secret, conectó
  el Redis compartido y desplegó; verificado: `/healthz` 200, sesiones en Redis, secret
  presente, API 2026-04. Lista para mandar el link.
- [Playbook](../../playbooks/shopify-app-custom-por-cliente.md) actualizado: registro de
  apps, Redis compartido, vencimiento de los links y mensaje para el cliente en noruego.

**Bug del dashboard: la API key pendiente se mostraba a la cuenta siguiente**

Angelo creó la cuenta de Vio de Makeup Mekka y, al ir a crear la conexión de Shopify,
Settings → Integrations le mostró la credencial de la cuenta anterior. Causa (front):
la espera de conexión se guarda en `localStorage` (`vio_pending_ecom_connection`, 24 h)
sin dueño, `logout()` no la borraba, y la pantalla muestra
`info?.apiCredential || created` — con `/ecom-user` vacío hasta que una tienda conecta,
la cuenta nueva ve la key de la anterior. No es fuga del backend: `/ecom-user` va con el
token de la sesión. Riesgo: conectar la tienda de un cliente a la cuenta equivocada; y el
gate `useShopifyManaged` mira la misma clave, así que cualquier cuenta de ese navegador se
veía "managed through Shopify" por 24 h. Arreglo en
`webapp-vio-commerce` [#30](https://github.com/vio-live/webapp-vio-commerce/pull/30)
([#30](https://github.com/vio-live/webapp-vio-commerce/pull/30)): la espera guarda el `uid`
de la sesión y se descarta si no coincide, si no hay sesión o si viene sin `uid` (versión
anterior); 7 tests nuevos. **El logout no la borra**: conectar la tienda lleva horas y su
dueño tiene que seguir viéndola — con el `uid` alcanza. Verificado además que la key no
depende del navegador: vive en `apiCredential` (users-ms `createApiCredential`, que además
no borra las anteriores) y la tienda conecta validando contra `GET /users/me`.

**A prod como hotfix**: PR mergeado a `develop` (`28d6af3`) y los 2 commits llevados a
`master` por cherry-pick (`d84ed33`), porque `develop` tenía 11 commits sin promover (Adyen,
Nexi, cuenta de Vio y Brand, Qliro) que siguen en QA. Vercel desplegó producción y
`dashboard.ecom.vio.live` sirve ese deploy. `master` queda con esos dos commits duplicados
respecto de `develop`: se resuelve solo en el próximo release.

## Decisions

- La demo se graba en una dev store nueva y la instala Angelo, que quería grabar todo el
  proceso.
- Las apps custom comparten un Redis; ya no hace falta crear uno por cliente.
- No reenviar a Shopify hasta resolver el punto del marketplace (recomendación; la
  decisión es de Angelo).

## Blockers / open questions

- **Punto del marketplace** (decisión de negocio, Angelo + Michael): preguntarle por
  escrito a Shopify, antes del 2026-10-05, si hay camino para un canal con checkout
  propio. Plan B: checkout de Shopify para el riel Shopify
  (`merchantOfRecord = "merchant"`), o quedarse fuera del App Store con apps custom.
- Preguntas abiertas a Angelo: ¿el "Channel cut" del publisher aplica a los merchants que
  vienen por Shopify? ¿La confirmación del 2026-08-21 quedó por escrito?
- El trial de la cuenta demo del listing vence alrededor del 2026-10-09, justo después de
  la suspensión.
- Las observaciones de Alan no tienen tarjeta propia.

## Next session

- Villoid: mirar los logs de `vio-sync-client` cuando instale; si no instala antes del 25,
  generar un link nuevo.
- Gladkokken: mirar los logs de `vio-sync-gladkokken` cuando instalen.
- Definir el camino del App Store antes del 2026-10-05.
