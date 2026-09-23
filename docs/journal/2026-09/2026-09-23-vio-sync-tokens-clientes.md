---
date: 2026-09-23
session: vio-sync-tokens-clientes
participants: [angelo, claude]
status: live
---

# Session — 2026-09-23 — Gladkokken instaló y no le entraban productos: los tokens

## Goal

Gladkokken instaló su app custom, conectó y exportó productos: en Vio no aparecía ninguno.
Encontrar por qué y destrabarlos sin que el merchant tenga que hacer nada, porque Angelo no
tiene acceso a su tienda.

## Done

**El diagnóstico, con los logs de prod**

1. La exportación sí encolaba: `products` recibía `import-from-shopify` con la cuenta
   `gladkokken` (user 1324) y **20 ids** de productos.
2. Ese import fallaba: `bulkImportProductsByIdsFromChannel → 500`, con el mensaje yendo a
   la DLQ tras los reintentos.
3. El 500 venía de `extensions`, que al leer la tienda recibía de Shopify
   **401 `Invalid API key or access token`**.
4. Antes de esa llamada, `extensions` intentaba renovar el token contra
   `/admin/oauth/access_token` con el **client id de la app pública** (`8994c429…`), no con
   el de la app custom de Gladkokken.

**La causa**: en `vio-extensions-microservice` (`shopify.service.ts`,
`asyncrefreshTokenIfApply`) el refresh toma `SHOPIFY_CLIENT_ID_EXPORT` /
`SHOPIFY_CLIENT_SECRET_EXPORT` del entorno — una sola app para todas las conexiones. Un
token emitido por la app custom de un cliente no se puede renovar con las credenciales de
otra app. Y con la **rotación estricta** de Shopify, cada vez que la librería del app
renueva la sesión, la copia que Vio guardó queda muerta. El análisis que Alan pidió a su
AI llegó a lo mismo.

Segundo detalle, que explicaba por qué fallaba incluso recién conectado:
`users-ms.saveShopifyExportConnection` guarda `Math.floor(Date.parse(expires) / 1000)`. Si
el app no manda `expires`, guarda `NaN`, el backend da el token por vencido y dispara ese
refresh roto en cada llamada.

**El arreglo, del lado del app** (`vio-shopify-sync`, rama `custom/client-app`,
[#106](https://github.com/vio-live/vio-shopify-sync/pull/106) + `3439dca`)

- `vioSyncTokens`: reenvía a Vio el access token, el refresh y los vencimientos vigentes,
  contra el mismo `POST /users/me/sales-channel` del Connect, que hace upsert.
- El **Home** lo llama en cada carga; si falla, lo registra y la pantalla sigue.
- **`/internal/sync-tokens`**: hace lo mismo con la **sesión offline**, sin el merchant.
  Pega primero al Admin API para que la librería rote el token, relee la sesión guardada y
  manda esa. Con `?ids=` reencola productos. Protegida por `CRON_SECRET`.
- **Cron de Vercel** cada 12 h en cada proyecto de cliente.
- El vencimiento que viaja nunca queda vacío (`expiryForVio`), así el backend no intenta su
  refresh.
- 199 tests, **100% de cobertura** (lo exige el repo), typecheck, lint y build limpios.

**Resultado**

- Desplegado en `vio-sync-demo`, `vio-sync-gladkokken`, `vio-sync-client` (Villoid) y
  `vio-sync-makeupmekka`, con `SHOP_DOMAIN` y `CRON_SECRET` nuevos en cada uno.
- Disparado a mano para Gladkokken con los 20 ids: **los productos empezaron a entrar**
  (`importShopifyProduct to user 1324 …`), los errores de import pararon y los
  `Invalid API key` de `extensions` pasaron de ~10 por minuto a **0**.
- Villoid y Makeup Mekka todavía no instalaron: la ruta responde `no_session`, y el cron
  empieza a servir en cuanto instalen.

**El lado del backend, listo para Alan**

- `vio-extensions-microservice` [#8](https://github.com/vio-live/vio-extensions-microservice/pull/8)
  (sin mergear): `maskSecret` en los logs que imprimían el `client_secret` de la app y los
  access/refresh tokens de las tiendas, y `shouldRefreshToken` para no intentar renovar
  cuando no hay refresh token o el vencimiento no es usable (con `expiresIn` nulo, la
  comparación daba "vencido" en toda llamada). Tests puros de las dos piezas; **la suite no
  se pudo correr en local** porque el kernel `@vio-/*` está en el npm privado.
- Trello [XxteZiYt](https://trello.com/c/XxteZiYt) (Dev/To do, Alan), con dos checklists:
  los pasos (mergear, CI verde, desplegar, y **rotar el `client_secret` de la app pública**,
  que quedó en texto plano en los logs) y cómo **replicarlo y probarlo en su dev store**:
  correr la gemela con la rama, forzar el caso poniendo `expires_in` en NULL, comprobar el
  401 de hoy, desplegar el PR en QA y repetir, revisar que los logs ya no traigan secretos y
  probar `/internal/sync-tokens`.

## Decisions

- **El dueño del refresh es el app**, no el backend: tiene las credenciales del cliente y
  la librería ya rota la sesión. Si los dos refrescan, con rotación estricta se invalidan
  entre ellos → [lección](../../lessons/tokens-rotados-un-solo-dueno.md).
- **No se guardan `client_id`/`client_secret` por conexión** en la base: repartiría los
  secrets de cada app custom y, por la rotación, tampoco alcanzaría. Si se quiere dejar
  explícito que el backend no refresca, la alternativa es una bandera
  `tokens_managed_by_app` — queda anotada en la tarjeta para que Alan opine.

## Blockers / open questions

- **Backend (Alan)**: mergear y desplegar el [#8](https://github.com/vio-live/vio-extensions-microservice/pull/8).
  Guardar `client_id`/`client_secret` por conexión **se descartó**: con la rotación estricta
  de Shopify, backend y app refrescando en paralelo se invalidan entre ellos, y además
  repartiría los secrets de cada app custom. Si se quiere dejarlo explícito, la alternativa
  es una bandera `tokens_managed_by_app` en `shopify_connection` (migración del kernel +
  `users-ms` + `extensions`); la migración la correría Miguel.
- **Seguridad**: `extensions` imprime en texto plano el `client_secret` de la app pública y
  los access tokens de las tiendas. Sacar esa línea y rotar el secret.
- Los mensajes que murieron en la DLQ no se reprocesan solos: si falta algún producto, se
  reencola con `?ids=` de la ruta interna.

## Next session

- Mirar los logs cuando instalen Villoid y Makeup Mekka (`vercel logs --project vio-sync-client`
  y `vio-sync-makeupmekka`); si algo no entra, reencolar con `?ids=` de `/internal/sync-tokens`.
- Confirmar con Gladkokken que ven sus productos en Vio.
- Seguir la tarjeta [XxteZiYt](https://trello.com/c/XxteZiYt): merge y deploy del PR #8, y
  sobre todo la **rotación del `client_secret`** de la app pública.
