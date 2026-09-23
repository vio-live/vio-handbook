---
title: "Lesson: con tokens que rotan, el refresh tiene un solo dueño"
last-updated: 2026-09-23
owner: angelo
status: live
---

# Lección — con tokens que rotan, el refresh tiene un solo dueño

## Qué nos costó

El 2026-09-23 Gladkokken instaló su app custom de Shopify, conectó su cuenta de Vio y
exportó 20 productos. En Vio no entró ninguno. La cadena, vista en los logs de prod:
`products` encolaba el import, `extensions` leía la tienda y Shopify contestaba
**401 `Invalid API key or access token`**.

Dos causas sumadas:

1. **Credenciales de otra app.** `asyncrefreshTokenIfApply` renueva el token con
   `SHOPIFY_CLIENT_ID_EXPORT` / `_SECRET_EXPORT`, que son del entorno: una sola app para
   todas las conexiones. El token era de la app custom del cliente, y Shopify **no renueva
   el token de una app con las credenciales de otra**.
2. **Rotación estricta.** Cada vez que la librería del app renueva la sesión, el refresh
   token anterior muere. La copia que Vio había guardado al conectar quedaba inservible
   aunque las credenciales fueran correctas.

Y un tercer detalle que hacía fallar incluso recién conectado:
`users-ms.saveShopifyExportConnection` guarda `Math.floor(Date.parse(expires) / 1000)`. Si
el app no manda `expires`, guarda `NaN`; `now >= null` es `true`, así que el backend daba
el token por vencido en **toda** llamada y disparaba ese refresh imposible.

## La regla

**Cuando el proveedor rota los tokens, un solo sistema puede renovarlos: el que tiene las
credenciales de esa integración y la sesión viva.** Los demás consumen la copia y se la
hacen empujar; nunca la renuevan por su cuenta.

En Vio eso significa:

- El **app de Shopify** (uno por cliente, con su propio `client_id`/`client_secret`) es el
  dueño: renueva y **empuja** los tokens a Vio — en cada carga del Home, por cron cada
  12 h y por `/internal/sync-tokens`, que además sirve para destrabar sin molestar al
  merchant.
- El **backend** no refresca esas conexiones. Si lo hiciera "también", cada refresh
  invalidaría el del otro y los 401 volverían, ahora intermitentes y más difíciles de leer.
- **No repartir secrets**: guardar el `client_secret` de cada app custom en la base para
  que el backend pueda refrescar es peor postura de seguridad y no resuelve la rotación.

## Señales para reconocerlo rápido

- `401 Invalid API key or access token` en llamadas que antes funcionaban, sin que nadie
  haya desinstalado nada.
- En los logs del que refresca, un `client_id` que **no** es el de la app por la que entró
  esa tienda.
- Un vencimiento nulo o en el pasado en la fila de la conexión: cualquier comparación
  `ahora >= vencimiento` con `null` da "vencido" y dispara refresh en cada request.

## Además

Buscando esto aparecieron el `client_secret` de la app pública y los access tokens de las
tiendas **en texto plano** en los logs de `extensions`
([PR #8](https://github.com/vio-live/vio-extensions-microservice/pull/8) los enmascara).
Un secreto en un log es un secreto comprometido: hay que rotarlo, no solo dejar de
imprimirlo.

Detalle completo:
[journal 2026-09-23](../journal/2026-09/2026-09-23-vio-sync-tokens-clientes.md) ·
[playbook de apps custom](../playbooks/shopify-app-custom-por-cliente.md).
