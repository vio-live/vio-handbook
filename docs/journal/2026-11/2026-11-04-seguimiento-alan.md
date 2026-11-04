---
date: 2026-11-04
session: seguimiento-alan
participants: [angelo, claude]
status: live
---

# Seguimiento de Alan — 04/11

Sigue el [03/11](./2026-11-03-seguimiento-alan.md). Alan vuelve hoy tras no trabajar el 3/11.

## Goal
Dejarle la cola clara y hacer guardia: verificar lo que reporte, arreglar en QA, subir y contestarle.
Foco de Angelo desde hoy: **Replit, Vipps y Kustom**.

## Done
- **~11:50 UTC, cola de Alan puesta al día en Trello** (como Angelo): #474 Boots → Done; #470 con lo único que
  falta (escenario 1) y el aviso de republicar sobre Vev 0.345; #471 y #472 con su estado (B1/B2/B4
  desbloqueados; tienda Shopify de Alan en QA con 401, reconectar antes del escenario 6; 412002 con descripción «QA»).
- **#475 creada:** envío gratis («Gratis») y «Avbryt» en Vipps con la SDK 0.37.7 ([tarjeta](https://trello.com/c/gcAL4NjH)).
- **#476 creada:** estrés del alta de un cliente, 8 bloques y 35 puntos sobre el playbook
  [alta-marca-en-articulo](../../playbooks/alta-marca-en-articulo.md) ([tarjeta](https://trello.com/c/SekdFcq5)).
- **#445 y #453 archivadas** (superadas / escritas contra un estado viejo).
- Cola: #470 (escenario 1) → #471 → #472 → #475 → #476.
- **Guardia convertida en rutina:** playbook [guardia-alan](../../playbooks/guardia-alan.md) y skill local
  `/guardia-alan` (bucle sobre la actividad de Alan en Trello).
- Prod, de paso: Faves (1301) y QKC (1302) tienen un solo envío vivo a 0 NOK en todos sus productos, y el mapeo
  Woo de extensions coincide. `_db.js` del playbook de alta corregido (`ENV_FILE` relativo en el pod).

- **13:28 UTC, Alan (#470):** «escenario 1 con campañas nuevas y limpias», órdenes **4673** y **4674**. Verificado en QA:
  surface 18 «Escenario 1», campañas 22 (default) y 23, **las dos de la marca 1333**, canal 508, Stripe; 4673 desde
  `/woo-origin` → campaña 22 y 4674 desde `/test` → campaña 23. Es el caso «cada artículo vende por su campaña» (escenario
  6), no el cruce entre marcas. Las campañas 13 y 15 ya no existen en QA. Contestado en la tarjeta: cómo montar el
  escenario 1 con dos marcas, pedir ids, y que 1333 no tiene nombre de marca (el recibo muestra el username). Alan pasó
  #471 a Doing (13:42).

## Decisions
- La guardia es diaria mientras Alan trabaje; foco Replit, Vipps y Kustom (Angelo, 4/11).

## Blockers
- Ninguno.

## Next session
- Ver «Done» de las vueltas de la guardia de hoy, abajo.
