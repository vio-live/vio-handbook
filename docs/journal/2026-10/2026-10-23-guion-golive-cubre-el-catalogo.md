---
title: El guion del go-live ya mira el catalogo del SDK (y prod verificada antes de la orden real)
date: 2026-10-23
owner: Miguel
---

## Tapado el agujero del guion de verificacion del go-live — Miguel

- Quien: Miguel (el aviso de que B4 estaba vacio salio de mi propia correccion de la noche del 22/10,
  recogida por la sesion de `vio` en MEMORY.md).
- Donde: `vio-commerce-prod-sc` (prod, Sweden Central), base `outshifter`; repo `vio-handbook`,
  `docs/playbooks/scripts/verificacion-golive-lunes.sh`.
- Cuando: 23/10/2026, 00:34-00:50 CEST, antes de la orden real de prueba de hoy.
- Contexto: el 22/10 por la noche el guion dio **4 OK / 4 OJO / 0 MAL** con el channel 480 a
  **0 productos**. O sea: declaraba el go-live sano mientras el catalogo del SDK estaba vacio.
  La causa de fondo ya esta escrita en
  [`../lessons/el-catalogo-del-sdk-sale-de-channel-user-products.md`](../lessons/el-catalogo-del-sdk-sale-de-channel-user-products.md);
  lo que faltaba era que el guion lo mirara.
- Hecho:
  - Probado en prod el esquema real de `channel_user_products` (tiene `deleted_at`, asi que el
    conteo lo filtra) y los conteos por channel: 476=10, 477=3, 478=2, **480=14**.
  - Anadido al guion un bloque B4 que cuenta las filas vivas del channel del publisher (1330) y,
    si da 0, dice con esas palabras que el SDK no muestra nada aunque Vipps si aparezca, con el
    arreglo idempotente: `POST /channel-process/collections/update {"collectionsId":[...]}` en el
    micro `products`.
  - Corrido de nuevo contra prod: `channel_user_products del channel 480 (Aller): 14 producto(s)`.
  - Estado de prod re-verificado entero antes de la orden real: 14/14 deployments, `api-ecom` 200 /
    `/api/users` 401, `payment_method` de Careless `mode=partner msn=1179558 captureMode=shipment`,
    channel 480 `vipps=1`, envio 59/79 NOK con pais NO, Admin 707 (1328) y share 606 a 1330.
    **4 OK / 4 OJO / 0 MAL**, y los cuatro OJO son los esperados sin trafico (sin eventos de Vipps,
    `inserted=0`, reinicios viejos de `api`/`users`).
- Pendiente: nada de esto. Lo que sigue abierto del go-live es de Angelo (A3/A4 pago y devolucion
  reales, B6/B6b el Replit, C4/C5 los avisos a Careless) y la segunda cuenta Admin, que necesita que
  Angelo diga que cuenta.
