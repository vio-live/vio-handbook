---
date: 2026-11-24
session: quick-fix
participants: [angelo, claude]
status: live
---

# Session — 2026-11-24 — Boots (prod): colección No7 y qué falta para vender

## Goal

Angelo: añadir a Boots los 13 productos No7 de la hoja «Boots apotek - products in artickle», crear una colección y
revisar si ya se pueden poner órdenes.

## Done

Todo en prod, cuenta de Boots **1308**, con las frases de Angelo para leer y escribir.

- **Los 13 ya estaban** en el catálogo, importados desde el feed: el SKU es el número del final de la URL de
  boots.no. Estaban en borrador, con precio de Black Week y el tachado, `referral_fee` 10, una imagen y sin categoría
  (12 de 13). El feed pone la cantidad a 999.
- **Colección** `tWOhIb-4q` «No7 – Jul 2026» con los 13, creada por el micro `collections`.
- **Clase de envío** `08f92b62…` «Levering velges i kassen»:
  - 0 NOK, NO, `default`, creada por `products/shipping/create` y colgada de los 13 (`join-product`);
  - es la primera clase de envío de Boots en prod;
  - existe solo porque `bulk-publish` la exige: en prod, Boots usa su propio envío por el Kustom Shipping
    Assistant (`providerShipping: true`, y Vio no le manda tarifas a Kustom);
  - va a 0 y con ese nombre para que el carrito no enseñe una tarifa que no es la de Boots.
- **Publicados** los 13 (`bulk-publish`): `status` 1 y `active` 1.

- **Disponible para Aller** (13:12 UTC): `collection_shared` 612 y conexión 545 Boots ↔ Aller, por solicitud
  (1460, de 1308 a 1330) y aceptación, como pide el playbook.
- **Kustom de Boots (prod), revisado tras cargar Angelo la clave** desde el dashboard:
  - Fila `98911dce…`: «Kustom», activa, clave cifrada `enc:v1`.
  - Descifrada dentro del pod de shopcart, sin imprimirla: es `kco_live_`, sin espacios. Contra
    `api.kustom.co` autentica (GET de una orden inexistente → 404 `NO_SUCH_ORDER`).
  - `captureMode: account`, devoluciones y cancelaciones apagadas, `providerShipping: true` y `merchantId` de Boots.
  - `user_settings.payment_kustom` = 1.
  - **Faltaba `termsUrl`:** añadido `https://www.boots.no/generelle-vilkar` (ensayo, COMMIT y relectura; la clave
    no se tocó).
- **🔴 El shopcart de prod tenía `KUSTOM_API_URL="https://portal.kustom.co"`** en el Secret `env-sc-shopcart`.
  - Esa variable se impone al host que sale de la clave, así que **ningún checkout de Kustom podía funcionar en
    prod**: cada llamada acababa en un 307 al login del portal.
  - Quitada la línea (Secret parcheado sin imprimirlo, 263 → 262 líneas) y `rollout restart` de shopcart (OK de
    Angelo, ~13:42 UTC).
  - Comprobado: los 2 pods nuevos están Running, sin errores, no tienen la variable y derivan `api.kustom.co`.
  - El `.env` montado viene del Secret (el `volumeMount` no está en el chart, pero sobrevive al `helm upgrade`). La
    copia del blob que se mete en la imagen al construirla **sigue llevando la línea**: si algún día se regenera el
    Secret desde el blob, vuelve el fallo.

## Decisions

- **Prod usa las keys de Kustom de Boots y su envío** (Angelo, 24/11), no nuestra cuenta ni tarifas de Vio.

## Blockers

Hoy no se pueden poner órdenes en prod:

- ~~Método de pago~~: hecho (ver Done).
- **Canal de Aller y campaña:** sin crear. El micro de campañas solo acepta la sesión de Firebase del publisher, así
  que se hace desde el dashboard como Aller. Faltan comisión, fin, nombre y si va pausada.
- **Pearlconvert:** tiene que estar recibiendo `order.created` en su Magento de prod. Lo último que se sabe (28/10) es
  que solo estaba en test. Si no, la orden llega al Kustom de Boots pero nadie la despacha.
- **Publisher, canal y campaña** del artículo: aún no hay ninguno.

## Next session

- Cuando esté la key: configurar el pago y comprobarlo en `/v2/mobile/config` (Kustom en `paymentMethods`).
- Compartir `tWOhIb-4q` con el publisher, canal y campaña (Angelo), y verificar con el script 4 del playbook
  [alta de marca](../../playbooks/alta-marca-en-articulo.md).
