---
title: "Prod: inventario de las 36 cuentas y propuesta de limpieza"
date: 2026-10-19
owner: miguel
decides: angelo
status: pendiente-de-aprobacion
---

# Prod: qué cuentas son reales y cuáles se pueden borrar

Angelo (19/10): *«ya crearemos aller en prod, y borramos cualquiera que no sea real»*.
**Nada ejecutado:** esto es el inventario para que él apruebe la lista. Todo medido en la base de
prod (`outshifter`), solo lectura.

## Antes de nada: cómo hay que borrar

- `user` tiene **`deleted_at` con `@DeleteDateColumn()`** en la entidad del kernel
  (`package-database/src/entity/User.ts:38`), así que **TypeORM soporta borrado blando**: la cuenta
  desaparece de todas las consultas normales de todos los servicios y **se revierte poniendo la
  columna a NULL**.
- **El borrado duro no es viable:** hay **57 tablas con FK a `user`**, y varias cuentas de prueba
  tienen filas de negocio reales colgando (órdenes, carritos, conexiones de Shopify). Un `DELETE`
  o falla por la FK, o arrastra historial de órdenes.
- **Falta la mitad de Firebase:** estas cuentas también existen como identidad en Firebase Auth. Con
  solo el borrado blando, la identidad sigue pudiendo autenticar y se encuentra con "Unknown user".
  Si se quieren fuera de verdad, hay que **deshabilitar también el usuario de Firebase**.

Propuesta: `UPDATE user SET deleted_at = NOW() WHERE id IN (...)` + deshabilitar en Firebase, en una
pasada y con la lista aprobada.

## Reales — NO tocar (8 confirmadas)

| id | cuenta | evidencia |
|---|---|---|
| 1302 | `qkoreancosmetics` | Woo a `https://qkoreancosmetics.no` — **dominio vivo**, responde 403 de Cloudflare (protección de bots, o sea sitio real). El username raro engaña: es cliente. |
| 1305 | `kondomeriet` | 2.457 productos + `product_feed` |
| 1306 | `nytelse` | 2.057 productos + `product_feed` |
| 1308 | `boots` | 3.821 productos + `product_feed` |
| 1323 | `villoid` | la app custom `vio-sync-client` es de `villoid.myshopify.com` (TOOLS.md). Ojo: **la cuenta no tiene `shopify_connection`** |
| 1324 | `gladkokken` | Shopify `wxuxre-tf.myshopify.com`, 61 productos |
| 1325 | `makeupmekka` | Shopify `makeup-mekka.myshopify.com` |
| 1327 | `careless` | Shopify `dignitycollect.myshopify.com`, 40 productos |

## No es cliente pero NO borrar: 1322

`shopifylink` tiene la conexión a **`vio-demo.myshopify.com`**, que es la tienda demo con app custom
`vio-sync-demo` **viva en Vercel** (responde 200) y su `CRON_SECRET` en TOOLS.md. Borrarla rompe el
demo. Si el demo ya no se usa, se retira app y cuenta juntas, no solo la cuenta.

## Deciden Angelo: 2 ambiguas

- **1307 `beta`** — "Beta". Sin productos, sin conexiones, solo la suscripción. No hay forma de
  saber desde la base si es un cliente real o una prueba.
- **1309 `life`** — "Life". Sin productos; su única `shopify_connection` apunta a
  `sales-channel-test-p5m0ti3c.myshopify.com`, que es **una tienda de pruebas** compartida con `asd`
  y `shopifysaleschann`. O es el retailer Life sin configurar, o es una cuenta de prueba.

## Candidatas a borrar: 25

Todas con nombre o dominio de prueba, y ninguna con tienda real detrás.

`1292` alan-new · `1293` alan-2 · `1294` alan-3 · `1295` nuevo-usuario · `1296` alan-shopify-test01 ·
`1297` alan-shopify-test-01 · `1298` alan-shopify-test-02 · `1299` shopify-user-to-submit ·
`1300` testwooprod · `1301` nudebeautyvioprod (`nudebeauty@vio.prod`) · `1303` testmultipleenvte ·
`1304` shopifysaleschann · `1310` asd · `1311` testshopifyprod1t · `1312` twsdasdasda1testn ·
`1313` trasdasdasd1testn · `1314` akjhdbakjsdbakjsd · `1315` aldcnaskjn123tstn ·
`1316` kdjaksjdkj123test · `1317` akjdasjdasjdhkasd · `1318` akjsdn12312332asd ·
`1319` accprevshop1testn · `1320` test · `1321` alanwoo21septestn · `1326` testprod

### Las que arrastran datos (razón extra para borrado blando, no duro)

- **1295 `nuevo-usuario@test.no`**: 77 referencias — **14 órdenes como reseller**, 18 carritos,
  13 productos, 4 `order_item` como supplier, 2 channels. Es la más enredada de todas.
- **1300 `testwooprod`**: 33 referencias, **10 `order_item` como supplier**, Woo a
  `dev-vio-test-supplier-prod.pantheonsite.io`.
- **1299 `shopify-user-to-submit@test.no`**: 29 referencias, **9 `shopify_connection`** a tiendas de
  prueba (`shop-user-to-submit`, `bvkxxq-cv`, `cb3e64`).
- **1304 `shopifysaleschann`**: 6 conexiones a la tienda de pruebas `sales-channel-test-p5m0ti3c`.
- **1322** queda fuera de la lista por lo dicho arriba.

## Lo que falta para el flow de campañas, aparte de esto

Aller como **publisher** lo da de alta Angelo por el flujo normal de registro. Detalle de por qué hoy
no hay ningún publisher en prod:
[2026-10-19-prod-no-hay-publisher-para-el-flow](./2026-10-19-prod-no-hay-publisher-para-el-flow.md).
Las brands no se tocan: las 8 reales ya resuelven a `brand`, que es lo que les corresponde.
