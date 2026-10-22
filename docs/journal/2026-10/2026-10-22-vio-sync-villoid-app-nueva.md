---
date: 2026-10-22
session: "Villoid instala: chequeo completo, link no regenerable y app nueva"
participants: [angelo, claude]
status: live
---

# Villoid: app nueva porque el link vencido no se regenera

## Goal

Angelo (22/10): «villoid quiere instalar ahora, puedes preparar un nuevo link y asegurarte que
todo está 100% listo para que nada falle?».

## Done

- **Chequeo de prod antes del link (11:40-12:00 UTC).** AKS y MySQL de Suecia encendidos. Las
  cuatro apps instaladas (demo, Gladkokken, Makeup Mekka, Careless) empujan su token cada 10 min
  por `POST /me/<id>/sales-channel/create`, el mismo camino que el connect: 20/20 con 200 en la
  última hora, media 0,75 s, máx. 2 s. `products` procesando actualizaciones de Shopify sin un
  solo `[ERROR]` en 26 h. `extensions`: sin 401 ni errores de Shopify (solo ruido de órdenes Woo
  de 1302 y dos 503 transitorios de Pub/Sub). Cuenta de Villoid en Vio: **1323**, sin
  `shopify_connection` (dato del [inventario del 19/10](../../handoff/2026-10-19-limpieza-cuentas-prod.md);
  `subscription` no tiene fecha de fin en el modelo).
- **El link no se puede regenerar.** Partners → Distribution de la app `425118728193` solo
  muestra el link de septiembre (vencido el 25/09 13:42) con un botón de copiar; el Dev
  Dashboard no tiene página de distribución y el CLI no tiene comando. Abrir el link vencido no
  sirve de prueba: Shopify pide la tienda y valida la organización primero
  (`invalid_link_organization` con una tienda ajena; no se instaló nada).
- **App nueva para Villoid reusando el deploy** (decidido por Angelo): app `438624845825`,
  client id `3ced68df11709eceb7ecb322fa7f0e99`, distribución custom a `villoid.myshopify.com`
  (multi-store Plus, org 1557419), config `vio-client-villoid-1` publicada con el CLI
  ([vio-shopify-sync#128](https://github.com/vio-live/vio-shopify-sync/pull/128), abierto a
  `custom/client-app`; la config vieja queda marcada como retirada). Vercel `vio-sync-client`
  con el client id y el secret nuevos (Angelo) y redeploy. Sin cambios en `VIO_CUSTOM_APPS`.
- **Verificado sin ver secretos:** `/auth/login` redirige con el client id nuevo; un webhook
  firmado por Shopify (`shopify app webhook trigger`, `customers/data_request`) respondió **200
  «Received»** en los logs de Vercel, así que el secret coincide; desde un pod de `extensions`,
  Villoid da 409 `no_session` y las otras cuatro 200. El procedimiento quedó en el
  [playbook](../../playbooks/shopify-app-custom-por-cliente.md#si-el-link-vence-sin-instalar-villoid-2026-10-22).
- **Link mandado por Angelo** con el mensaje noruego (variante con la key de la cuenta Vio, que
  pegó él); vence el **2026-10-29 13:18** Oslo.
- **Bug encontrado de paso en `users` (no toca Shopify):** un pod de users murió a las 11:01:40
  UTC (exit 1). El listener `user-service:sync-woo` llama 3 min después a
  `GET /:userId/notificationWooImportProduct` sin `catch`, y ese endpoint **siempre** da 500:
  hace `res.send(0|1)`, que Express toma como código de estado. Resultado: cada conexión Woo
  tumba un pod de users 3 minutos después. El camino de Shopify (`saveShopifyExportConnection`)
  no emite nada parecido. Quedó como tarea aparte para arreglarlo por PR.

- **extensions #26 (limitador de Shopify por tienda) ya está en prod**: llegó a `master` con el
  release del 21/10 ([#28](https://github.com/vio-live/vio-extensions-microservice/pull/28),
  10:15 Oslo) y corre en los dos pods (`dist/utils/per-shop-client.js`, usado por
  `shopify.service.js`). Durante la sesión dije que faltaba: leí al revés el `compare` de
  GitHub (`master...<commit>` = `behind` significa que el commit **ya está** en master).

## Decisions

- **Villoid va con una app nueva** en vez de esperar a Partner Support: el cliente quería
  instalar ya y el deploy se reusa entero.
- **Los links custom se generan el mismo día que el cliente instala**; vencidos no se recuperan
  (playbook, paso 10 y Gotchas).

## Blockers

- El clasificador bloqueó al agente: escribir y leer variables de Vercel (`vercel env`), la
  lectura de la base de prod desde el pod de users y sacar el client id del DOM. Lo de Vercel lo
  hizo Angelo; la key de Villoid no se pudo atar a la cuenta 1323 por la base y se confirma al
  conectar (users registra el id de la cuenta).
- `vercel env pull` falla en estos proyectos («Production Project Environment Variable not
  found»), también en Careless y con el CLI 65.1.0.

## Next session

- Seguir la instalación de Villoid (hay un vigilante sobre `/internal/token`), luego el connect
  (que la conexión quede en la cuenta **1323**) y la primera exportación.
- Merge de vio-shopify-sync#128 (humano).
- Arreglo del crash de `users` por la notificación Woo (tarea aparte, PR a `develop`).
