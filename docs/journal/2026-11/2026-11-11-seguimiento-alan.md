---
date: 2026-11-11
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 11/11

## Goal
Guardia sobre Alan desde las 12:50 UTC (Angelo: «ponte a monitorear a alan»). Foco único: tarjeta #481
[zM6LN43p](https://trello.com/c/zM6LN43p), Boots × Kustom en el Replit de staging: montar todo el flujo en el
dashboard de QA, dos artículos (uno nuevo y el de Careless pasado a Boots), 2 órdenes con la cuenta de Kustom de
Boots y el estrés (importes, envío, envío gratis) con nuestra cuenta de Kustom; evidencias y lista de mejoras.

## Done
- **Antes de la guardia (mañana):** las 4 órdenes que pidió Pearlconvert las hizo Angelo desde la página local de la
  SDK 0.37.8 (VIO-4702 a 4705, AUTHORIZED, sin capturar, con `tms_reference`). Borrador a Artsiom en Gmail para
  que lo mande Angelo. La #481 se reescribió para que Alan pruebe el Replit (ya no hacen falta sus órdenes para Boots).
- **12:46 UTC:** Alan mueve la #481 a Doing.
- **12:53 UTC:** copia de seguridad de la configuración de Kustom de «Boots test» (1342) en QA: fila
  `payment_method` `22b909d1-…` (inactiva y borrada lógicamente), copia de `b843da58-…` (MID PM47345027,
  captureMode account, providerShipping on). Sirve para restaurarla cuando Alan termine la parte F con nuestra cuenta.
- **14:19–14:24 UTC:** Alan monta en QA: comparte la colección de Boots que ya existía (`Q07Qbp-vr`, 9 productos) con
  el publisher 1312 → conexión `channel_user` 525 «Boots Alan Test»; crea una **surface nueva** 20 «Boots Alan» y en
  ella la campaña 29 «Campaign Boots Alan» (por defecto en esa surface). La tarjeta pedía la surface 13 «Mote Livestill
  Hub» (la que tiene conectada el Replit de staging, y la del artículo de Careless) y una colección nueva con los 4.
- **14:39 UTC:** comentario en la #481: campaña en la surface 13, sin marcarla por defecto; colección nueva con los 4;
  en las compras solo los 4 SKUs (los otros 5 no existen en el test de Boots).

- **14:41 UTC:** Alan corrige: campaña 30 «Boots Alan Test» en la surface 13, no por defecto, con la conexión 525.
- **16:10–16:42 UTC (Alan en la #481):** B OK en móvil y escritorio salvo el bloque «Vio Remote Reel (Staging)»
  («Vio avviste nøkkelen… be Angelo om ny»: clave de administración del reel, fuera de esta tarjeta). C: al pasar el
  artículo de Careless a la campaña de Boots desaparecen los productos de Careless (esperado: un artículo = una marca).
  Pide clonar el artículo «Sneakers 2026…» para no romperlo. **D1 hecha sin avisar** (el Replit ya aceptaba Kustom).
- **D1 verificada:** VIO-4706 (16:34 UTC, surface 13, campaña 30) = Kustom `250fd1ec-…` AUTHORIZED, fraude ACCEPTED,
  sin capturar: 1 × 998640 409,90 + 2 × 996406 169,90 + «Utlevering i Boots Apotek» 0 = 579,80 en Vio y en Kustom,
  con `tms_reference`. **Primera orden con Kustom desde el Replit de staging.**
- **17:14 UTC:** respuesta en la #481: D2 a domicilio (1 × Cosmica + 1 × Weleda) y ninguna más con la cuenta de Boots;
  usar el artículo de Careless original (C1/C6); C esperado → mejoras; Remote Reel fuera de alcance; OK para la parte E.
## Decisions
- Con la cuenta de Kustom de Boots, solo 2 órdenes (llegan al Magento de test de Boots); el resto con nuestra
  cuenta de test (PM00876249), con el envío calculado por Vio para poder probar tarifas y envío gratis (Angelo).
- El artículo «antiguo» es el de Careless (Angelo); Alan lo deja como estaba al final.
- Restaurar «Boots test» a la cuenta de Boots lo hago yo, no Alan.

## Blockers
- Las compras (D, E, F) esperan a que el agente de Replit aplique el soporte de Kustom en staging (prompt entregado
  a Angelo el 11/11). Angelo avisa y entonces le escribo a Alan en la tarjeta.

## Next session
- Avisar a Alan en la #481 cuando el Replit tenga Kustom. Verificar cada orden de 1342 contra Kustom (importes, envío).
- Restaurar `b843da58` desde `22b909d1` cuando Alan termine.
