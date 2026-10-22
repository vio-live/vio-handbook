---
title: Checklist de go-live Careless x Aller (lunes 26/10)
last-updated: 2026-10-22
owner: Miguel
status: en curso
---

# Checklist de go-live — lunes 26/10

Lista viva. El plan razonado y las mediciones estan en
[`2026-10-22-plan-go-live-careless-aller.md`](./2026-10-22-plan-go-live-careless-aller.md).
Aqui solo se marca. Cada linea tiene **dueno** y **criterio de hecho** (como se comprueba, no como
se siente).

Convencion: `[x]` hecho y verificado · `[~]` hecho pero sin verificar de punta a punta · `[ ]` abierto.

---

## A. Cadena critica del pago (en este orden, no se puede saltar)

- [x] **A1. Admin de equipo Vio en prod** — *Miguel*
  Hecho 22/10 15:1x. `user_role` id 707: `user_id=1328` (`vio`, Angelo), `role_id_role=1` (Admin),
  `active_user_role=1`. Era la **unica** fila de la tabla.
  Verificado en el codigo del pod: `resolveAccountType` pone `internal` primero, asi que el Admin
  **gana** sobre `is_business=1`; y `getAccountType` lee la base en cada peticion
  (`roleService.getActiveRoleIds`), **no** el claim de Firebase y **no** hay cache.
  Criterio: 1328 ve *Vio team* con `channels:manage`, `surfaces:manage`, `campaigns:manage`.
  Pendiente menor: **una segunda cuenta Admin** para no depender de una sola persona el lunes.

- [ ] **A2. Careless en modo partnership + MSN 1179558** — *equipo Vio por el dashboard, tras A1*
  *Vio team > Vipps partner*: Express, envio, captura, nº de organizacion, asignar la unidad y
  encender Vipps.
  Criterio: nace **1 fila en `payment_method`** (hoy 0) y el log de shopcart dice `mode:partner`.
  Gotcha: Careless tiene `organization_number` **null** en la base. Si la pagina lo exige, se
  rellena con **928540650** (el que devuelve Vipps para la unidad 1179558). Un UPDATE, lo hago yo.
  **No se puede insertar la fila a mano**: nace en `platform`, el checkout usa claves de test
  contra `api.vipps.no` y da 417.

- [ ] **A3. Pago real de prueba en prod, importe minimo** — *Angelo, tras A2*
  Criterio: el cobro aparece en el portal de Vipps en la unidad **1179558** (NO en la de Vio), y el
  log de shopcart **no** dice `[vippsEvent] ... refused: signature mismatch`.
  Es el unico paso que no se puede fingir. Webhook de prod ya registrado (`e1de7656`).

- [ ] **A4. Devolucion de ese mismo pago** — *Angelo, tras A3*
  Criterio: la devolucion se ve en Vipps y llega `order_refunded` al colector.

---

## B. Cadena del contenido y la atribucion

- [ ] **B1. Cuenta de Aller Media en prod** — *Angelo*
  Hoy **no existe ninguna** (busque por username, name y brand_name en todo el rango).
  Alta + suscripcion con cupo + **rol Publisher** (fila `user_role` role 3; `users` solo mira la
  base, el micro de campanas acepta tambien el claim `channel` — por eso conviene la fila).
  Criterio: la cuenta entra al dashboard y puede crear channel.

- [ ] **B2. Los 5 productos del articulo, en prod** — *Careless, desde su Shopify*
  «10 nyheter vi onsker oss na»: Cassia jakke, Hennie cardigan, Vilde genser, Sofie genser,
  Active pile fleece half-zip. Hoy solo esta la linea «Active».
  **Nadie de nuestro lado puede hacerlo.** Es el item con mas plazo de terceros: **pedirlo hoy**.
  Criterio: los 5 con `active=1` en prod.

- [ ] **B3. Conexion Careless <-> Aller aceptada y channel creado** — *Angelo / equipo Vio, tras B1*

- [ ] **B4. Productos publicados en el channel de Aller** — *equipo Vio, tras B2 y B3*
  `channel_user_products` de Careless esta a **0**: aunque el pago funcione, el lunes **no aparece
  nada en catalogo**. Hacen falta las filas + `product.active=1` (ya) + envio que cubra el pais (ya)
  + `channel_group` para que campanas y dashboard vean la marca.
  Criterio: los 5 productos salen en el catalogo del channel.

- [ ] **B5. Surface de Mote & Livsstil + campana con Careless de sponsor** — *tras B4*
  `surface`, `campaign` y `brand_profile` estan a **0** en prod. Comision por defecto 15 %.

- [ ] **B6. Replit de Aller en prod, con el SDK** — *Angelo*
  El `www.moteoglivsstil.no` publicado hoy **no tiene ni una referencia al SDK de Vio**.
  **Fijar la version**: npm esta en `@vio-live/web-sdk@0.27.0`, el prompt del 21/10 decia 0.26.1.
  La misma en Replit y en Vev, y una ya probada en QA — no estrenar version el lunes.
  Criterio: `Vio.analytics.start` con consentimiento y el colector dejando de estar a 0.

---

## C. Red de seguridad (mio, no depende de nadie)

- [ ] **C1. Dump a mano de la base de prod, el viernes al cerrar** — *Miguel*
  Con el estado bueno ya configurado. El CronJob `mysql-prod-offsite-backup` sigue roto por diseno
  (instala paquetes en runtime y el sidecar de Istio le corta la salida), asi que **esto es la unica
  red** si hay que volver atras.
  Criterio: dump con MD5 verificado y conteo de tablas, subido al blob.

- [ ] **C2. Congelacion de prod desde el viernes por la tarde** — *todos*
  Nada a `develop` ni `master` de los repos de Commerce. Un deploy corta **~62 s de 503** aunque
  haya 4 replicas (medido). Si hay que tocar algo: `rollout restart`, no el pipeline.
  Ya confirmado por la sesion de `vio`: sin trabajo en curso que toque prod.

- [ ] **C3. Guion de verificacion del lunes, escrito y probado** — *Miguel*
  Los comandos exactos de la primera hora, listos para pegar, no improvisados.

- [ ] **C4. Avisar a Careless de que una devolucion en su Shopify mueve dinero en Vipps** — *Angelo*
  Pendiente desde el 16/10. El lunes ya es dinero real.

---

## D. Vigilancia del lunes, primera hora

- [ ] **D1.** Log de shopcart sin `[vippsEvent] ... refused: signature mismatch`
- [ ] **D2.** El `inserted` del colector dejando de ser 0
- [ ] **D3.** El cobro visible en la unidad **1179558** del portal de Vipps
- [ ] **D4.** Infra: 14/14 deployments y `api-ecom.vio.live` a 200

---

## E. Riesgos con accion, no solo anotados

- [ ] **E1. Envio de Careless en EUR con los productos en NOK.** Puede ser conversion correcta, pero
  **solo lo destapa un pago real** (A3), no un repaso visual. Si el cobro sale con el importe
  equivocado, es esto.
- [ ] **E2. Deriva de version del SDK** (0.27.0 vs 0.26.1). Lo cierra B6. Que **nadie** lo toque en
  paralelo o acabamos con dos versiones en produccion el dia del lanzamiento.
- [ ] **E3. QA apagado todo el fin de semana.** Lo que haya que probar en staging va el **viernes**.
- [ ] **E4. Prod sin apagar el fin de semana.** Ahorrar ~46 USD no compensa un arranque malo el lunes.

---

## F. Plan B, decidido de antemano

Si el **viernes por la tarde no hay un pago cobrado** en la unidad de Careless: salir el lunes
**sin compra** — contenido y analitica, que no mueven dinero — y activar el pago cuando este
probado. Un dia de ventas se recupera; un primer pago que falla delante de Aller y Careless, no.
