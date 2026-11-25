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

- **Canal y campaña** (~13:52 UTC, dashboard de prod con la sesión de Aller, por encargo de Angelo):
  - canal **487 «Boots»** con la colección `tWOhIb-4q`: 13/13 productos y 13/13 copias de Aller. Kustom visible
    («1 of 1 shown to buyers»), y `available-payment-methods/487` = `["Kustom"]`;
  - campaña **8 «Boots»** en la surface 1 (Mote Livsstil Hub): activa, sin inicio ni fin («Always on»), no es la
    campaña por defecto, canal 487 y sin slots todavía;
  - comisión **10 %** (Angelo). El dashboard no tiene ese campo y la campaña nace al 15 %, así que se cambió en la
    base (ensayo y COMMIT);
  - `brand_profile` 1308 creado solo con `terms_url` (`/generelle-vilkar`) y `refund_policy_url`
    (`/retur-og-angrerett`). Sin logo (le toca a Alan) ni promesas (Michael);
  - `/v2/mobile/config` de la surface 1 lista la campaña 8 con `paymentMethods: ["kustom"]`, `termsUrl` de Boots y
    la key del canal.

- **25/11, 6 productos No7 Good Intent añadidos** (Boots los sumó a la hoja): 421638 (767390), 421659 (767395),
  421641 (767389), 421660 (767384), 421637 (767386), 421639 (767387). Ya estaban en el feed de Boots sin publicar;
  clase de envío `08f92b62…`, publicados y añadidos a `tWOhIb-4q`. Canal 487: 19/19 y 19/19 copias de Aller
  (script 4 del playbook). La hoja marca Lip & Cheek Glow (421901) como «Ikke på nettlager, fjern denne fra
  artikkel»: quitado de la colección con OK de Angelo (`collectionItem/delete`); colección y canal 487 en 18/18.
  El ejemplo del texto de Replit pasa a 421638 (Skin Sip Moisture Milk).

- **25/11 11:14 UTC, primera orden real de Boots: 4145** (Angelo, artículo `boots-no7-test` de Replit, campaña 8):
  - Kustom live `6d21300f…`, ref. MCHRE4JC, factura, AUTHORIZED / ACCEPTED, 899,40 NOK (IVA 179,88), sin capturar
    (`captureMode` account: captura Boots). `merchant_reference1` VIO-4145, acknowledge hecho.
  - Envío del Shipping Assistant: «Utlevering i Boots Apotek», PickUpStore, 0 kr, con tienda elegida.
  - Validation callback 200 (base-api → shopcart). El push por orden no llegó: la orden se reconoció a los 8 s
    por el return, antes de los ~2 min del push.
  - Reparto con el 10 %: marca 809,46, Aller 62,96, Vio 26,98. `order_paid` aceptado por el colector.
  - **El colector no responde a lecturas** (`/v1/stats/recent` 500/504 a los 30 s; `/health` 200): el aviso de
    órdenes de Slack no ve la 4145 y el aviso de datos parados salta cada hora desde la mañana.

## Decisions

- **Prod usa las keys de Kustom de Boots y su envío** (Angelo, 24/11), no nuestra cuenta ni tarifas de Vio.
- Campaña de Boots: **10 %, desde hoy y sin fin** (Angelo, 24/11).

## Blockers

Hoy no se pueden poner órdenes en prod:

- ~~Método de pago~~: hecho (ver Done).
- ~~Canal y campaña~~: hechos (canal 487, campaña 8).
- **Prueba sin pagar (24/11, OK de Angelo):**
  - carrito `03d52764…` en el canal 487 con 1 × 421901 (89,40 kr), checkout `a19b17a1…` y sesión de Kustom *live*
    `8f9f4e24…`, sin completar;
  - leída en Kustom con la key de Boots: `checkout_incomplete`, NOK, `nb-NO`, línea con `reference` 767382 (el SKU
    de Boots), IVA 25 %, `terms` de boots.no, `push` y `validation` a `api-ecom.vio.live`, `merchant_data` con
    `vio_checkout`/`vio_seller` 1308/`vio_channel` 487, y sin `shipping_options` de Vio;
  - el widget carga y muestra Klarna, Vipps, Visa, Mastercard, Apple Pay y Google Pay, y «godtar Boots Apoteks
    vilkår»;
  - **falta ver las opciones del Shipping Assistant:** Kustom pide nombre, dirección y móvil antes de enseñarlas;
    se verá con Replit ([texto](../../handoff/2026-10-15-replit-y-demo-web-a-commerce.md#boots-en-la-copia-de-pruebas-con-kustom-2411--texto-para-el-agente-de-replit));
  - los 2 carritos de la prueba, borrados;
  - catálogo de la campaña 8 (`/v2/commerce/sponsors/1308/catalog`): 13 productos con los precios de boots.no y las
    13 imágenes en 200.
- **SDK: el «Gratis» de Kustom, arreglado** en [web-sdk#165](https://github.com/vio-live/vio-web-sdk/pull/165)
  (`24dc09c`). Release [web-sdk#166](https://github.com/vio-live/vio-web-sdk/pull/166) (`cbe2898`); **0.40.2
  publicada en npm por Angelo el 25/11 09:50 UTC** (`latest`).
  - Antes: con Kustom elegido y antes de que el widget diera el envío, el resumen caía a la clase de Vio y decía
    «Frakt – Levering velges i kassen: Gratis».
  - Ahora: el envío y su nombre son los del widget, y hasta entonces se lee «Beregnes ved kasse».
  - Hay un test nuevo que falla con el código anterior. Los tipos están limpios. Los 16 tests que fallan en este
    Mac fallan igual en `main` (Node 26).
  - Falta que Replit suba a la 0.40.2 (el texto del handoff ya la pide).
- **SDK de Replit:** la copia de pruebas lleva la 0.39.0 y la web real la 0.37.7. Los arreglos de Kustom están en la
  0.39.1 y la 0.39.2, y su parte de shopcart (#120) ya está en prod.
- **Artículo:** `data-vio-campaign="8"` en el artículo de Replit/Aller.
- **Blob del `.env` de shopcart:** todavía lleva `KUSTOM_API_URL`.
- **Pearlconvert:** tiene que estar recibiendo `order.created` en su Magento de prod. Lo último que se sabe (28/10) es
  que solo estaba en test. Si no, la orden llega al Kustom de Boots pero nadie la despacha.
- **Publisher, canal y campaña** del artículo: aún no hay ninguno.

## Next session

- Cuando esté la key: configurar el pago y comprobarlo en `/v2/mobile/config` (Kustom en `paymentMethods`).
- Compartir `tWOhIb-4q` con el publisher, canal y campaña (Angelo), y verificar con el script 4 del playbook
  [alta de marca](../../playbooks/alta-marca-en-articulo.md).
