## B1 cerrado: Aller Media (1329) con rol Publisher en producción — Miguel

- Quién: Miguel. Angelo creó la cuenta y me pasó el id ("usuario de aller: 1329", 22/10 16:53 Oslo).
- Dónde: base de **producción** (`outshifter`), tabla `user_role`.
- Cuándo: 22/10/2026, ~17:00 Oslo.

### Estado de partida medido

- `user` **1329**: `allermedia`, `name` Aller, `brand_name` «Aller media», `country` NO,
  `is_business = 1`, `active = 1`, creada hoy **14:53Z** — una hora después de la búsqueda en la que
  reporté que no existía ninguna cuenta de Aller. Esa búsqueda era correcta en su momento.
- **Suscripción ya resuelta**: `subscription` **631**, `status active`, `plan_id 1`, `is_prod 1`,
  creada en el mismo minuto que la cuenta. A diferencia de las cuentas viejas de prod, esta nació
  con suscripción: **no hace falta el rescate** de `POST /api/users/create/subscription`.
- `user_count_plan` 523 existe (contador de uso, no cupo: el de Careless marca `total_sku 40`, que
  son sus 40 productos).
- **`user_role` estaba con una sola fila** (la 707, Admin de 1328). 1329 **no tenía rol**.

### Por qué faltaba el rol y qué cambiaba

`resolveAccountType` ordena `internal` → `publisher` → `brand`, y mete `brand` también cuando
`isBusiness === true`. Con 1329 sin fila de rol y `is_business = 1`, la cuenta resolvía a **`brand`**:
features `commerce:manage`, `surfaces:read-footprint`, `campaigns:read-footprint`… **sin
`channels:manage`**. O sea, Aller no habría podido crear su channel.

### Hecho

`INSERT INTO user_role (active_user_role, user_id, role_id_role) VALUES (1, 1329, 3)` →
fila **708**. Role 3 = Publisher (tabla `role`: 1 Admin, 2 Supplier, 3 Publisher).

### Verificado

Reproduje **la consulta exacta** que corre el servicio (`roleService.getActiveRoleIds`:
`INNER JOIN role` + `activeUserRole = true`) y pasé el resultado por la misma lógica de
`resolveAccountType`:

- user 1328 → roles `["Admin"]`, is_business 1 → accountType **internal** (matches: internal, brand)
- user 1329 → roles `["Publisher"]`, is_business 1 → accountType **publisher** (matches: publisher, brand)

Features que gana 1329: `commerce:read`, `channels:manage`, `surfaces:manage`, `campaigns:manage`,
`analytics:surfaces`. **No hace falta re-login**: `getAccountType` consulta la base en cada petición,
no el claim de Firebase, y sin caché.

### Siguiente (B3) — con un dato nuevo

El channel de Aller **tiene que ser de tipo `Sdk` (channel_id 10)**, no `GraphQl` (12).
En QA, los 10 channels con los que se ha probado el flujo son todos `Sdk` y **todos con
`channel_user_settings.vipps = 1`**; los dos de `GraphQl` tienen `vipps = 0`. En prod los únicos 3
channels que existen son `GraphQl` con `vipps = 0`, todos de cuentas de prueba (1295 y 1300).

Conviene crearlo **desde el dashboard**, no a mano: la alta genera también la api key
(`user_channel_api_key`) y la fila de `channel_user_settings`. En cuanto exista, B3b es encender
`vipps = 1` en esa fila de settings y comprobarlo con
`GET /channel/available-payment-methods/<channelUserId>`.

---

## E1: el envío de Careless pasado a NOK — Miguel

- Quién: Miguel, por orden de Angelo ("conviértelos en nok por ahora", 22/10 19:11 Oslo).
- Dónde: base de **producción**, tablas `shipping` y `shipping_country`.
- Cuándo: 22/10/2026 ~19:20 Oslo.

**No era una conversión de divisa.** Careless tiene **un solo** envío, `60af8d5a-9b2a-4daf-91f3-28a7aa6e6f75`,
«Default Shipping», `default = 1`, creado el 16/10 en el mismo segundo que la conexión de Shopify:
`amount 10.00`, `currency_code EUR`. Su única fila de `shipping_country` (país `NO`) igual. Los 40
productos de 1327 cuelgan de ese envío y **los 40 tienen `price_currency_code = NOK`**.

El dato que decide cómo arreglarlo: **todos los demás comercios tienen exactamente «Default Shipping
10.00 NOK»**. Los 10,00 EUR no eran un precio pensado para Noruega, eran el defecto del alta — de los
18 envíos de prod, solo tres están en EUR (1298, 1304 y 1327). Así que lo correcto era **cambiar la
moneda y dejar el importe**, no convertir 10 EUR a ~118 NOK.

Hecho: `UPDATE ... SET currency_code='NOK'` en las dos filas, con `AND currency_code='EUR'` para que
fuera idempotente. **1 fila afectada en cada tabla**; después, 0 filas en EUR para 1327.

Verificado que no hay una tercera copia: el catálogo y el checkout leen `shipping.currencyCode` y
`shippingCountry.currencyCode` en `channelService` del micro `api` (y por el camino
`productCollectionSharedShipping`, el de las collections compartidas, las mismas dos tablas).

**Queda para Careless, y es decisión suya:** 10 NOK es ~1 EUR, un placeholder. Su tarifa real
(49/79 NOK, o gratis sobre X) la tienen que fijar ellos.
