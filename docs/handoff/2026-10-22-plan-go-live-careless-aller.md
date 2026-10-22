---
title: "Go-live del lunes 26/10: Careless + Aller — plan, estado medido y riesgos"
last-updated: 2026-10-22
owner: angelo
status: plan — 7 bloqueantes abiertos, 2 días hábiles
---

# Go-live del lunes 26/10: Careless + Aller

Angelo (22/10): «el lunes vamos live con Careless y Aller […] nos jugamos mucho». Este documento es
el plan de coordinación: qué hay medido hoy, qué falta, quién lo hace, qué se prueba, qué puede
salir mal y cómo se revierte.

**Lo que sale el lunes, en una frase:** Aller Media (publisher) vende productos de Careless (brand)
desde los artículos de **Mote & Livsstil** (su web en Replit), y el dinero lo cobra **Careless** en
su propia unidad de Vipps (**MSN 1179558**) a través de la partnership de Vio.

---

## 1. Estado medido hoy, 22/10 (no documental: leído de prod)

### Listo y verificado

| Pieza | Evidencia |
|---|---|
| Infraestructura de prod | 14/14 deployments sanos, `api-ecom.vio.live` 200, `api.vio.live` 200, `campaigns.vio.live` 200 |
| Micro de campañas | `campaigns:35`, arranca con **TypeOrmCoreModule** y Redis: **persiste**, no guarda en memoria |
| Vipps partnership | Partner keys de producción cargadas en `shopcart` y `api`, `VIPPS_API_URL=api.vipps.no`, token 200 |
| Unidad de Careless | `GET /management/v1/sales-units/1179558` → `Careless AS`, org 928540650, `paymentAllowed: true`, `captureType: ReserveCapture` |
| Lookup por el camino real | `GET /paymentmethod/vipps-partnership/sales-units?orgNumber=928540650` → `{"available":true,"units":[{"msn":"1179558","name":"Careless AS"}]}` |
| Webhook de partner | `e1de7656-76e2-4871-b23b-2c54119bc7b3`, un solo registro, 8 eventos, `forAllSalesUnits`. Firma inventada → **401** y el log dice `with 1 secret(s)` para la msn 1179558 |
| Backend de la página Vipps partner | `/api/admin/vipps/sales-units` responde **401**, no 404: está desplegado |
| Cifrado de secretos de pago | `PAYMENT_SECRETS_KEY` activa en prod |
| Correos | `EMAIL_DELIVERY` fuera de orders, users y api: apagados |
| Careless como cuenta | id **1327**, `is_business=1`, activa, suscripción plan 1 **active**, **39 productos activos**, 40 con clase de envío que cubre **NO** |
| Colector de analytics | VM `82.70.54.151`, `ready: true`, Mixpanel `enabled`, sin errores |

### Lo que está a cero (y por qué importa)

| Medición en prod | Consecuencia |
|---|---|
| `user_role`: **0 filas** | **Nadie es Admin de equipo Vio.** La página *Vio team › Vipps partner* no se puede usar |
| `payment_method`: **0 filas** | Careless **no tiene fila de Vipps**. Su checkout cae a `platformConfig()` = claves de **test** contra `api.vipps.no` → **el pago falla en el token** |
| Ninguna cuenta de Aller | Busqué por `username`, `name` y `brand_name` en todo el rango 1292–1330: **el publisher no existe en prod** |
| `campaign`, `surface*`, `brand_profile`: **0 filas** | No hay surface ni campaña: la página no tiene nada que servir |
| `channel_user_products` de Careless: **0** | Sus 39 productos **no están publicados en ningún channel**: no aparecen en el catálogo |
| Los 5 productos del artículo | No están en prod (ni por `shopify_id`, ni por título). Los de Careless en prod son los 40 de la línea «Active» |
| Colector: `inserted: 0`, `forwarded: 0` | Nunca ha entrado un evento real. Esperado: ninguna página publicada lleva el SDK apuntando a prod |

---

## 2. Los 7 bloqueantes, en orden de dependencia

Están ordenados: cada uno necesita el anterior. El orden no es negociable, el reparto sí.

1. **Admin de equipo Vio en prod** — *Miguel, 1 minuto, en cuanto haya email.*
   `user_role` con `role_id_role = 1` y `active_user_role = 1` para la cuenta de equipo de Vio.
   Sin esto **nada más de esta lista se puede hacer por el dashboard**. Roles en prod: 1 Admin,
   2 Supplier, 3 Publisher. Angelo me pasa el email de Alan (tarjeta `djzHxncE`); si el lunes
   depende de una sola persona, conviene **dos** cuentas Admin, no una.

2. **Careless en modo partnership y con su MSN** — *equipo Vio desde el dashboard, tras el 1.*
   *Vio team › Vipps partner* → poner Express, envío, captura y nº de organización, asignar
   **1179558** y encender Vipps. Esto crea la fila `payment_method` que hoy no existe. **Es el paso
   que hace que el dinero caiga en Careless y no falle.** La página ya consulta a Vipps y valida que
   el MSN es de esa organización: hoy responde bien, lo probé.
   - Ojo: Careless tiene `organization_number` **null** en la base. Si la página lo exige, hay que
     rellenarlo con **928540650** (el que Vipps devuelve para esa unidad).

3. **Cuenta de Aller Media en prod** — *Angelo.*
   Alta, suscripción con cupo para crear channel, y **rol Publisher** (rol 3 en `user_role`, o el
   claim `channel` de Firebase; el micro de campañas acepta cualquiera de los dos, `users` solo mira
   la base — por eso conviene la fila). Luego: aceptar la conexión con Careless y crear su channel.

4. **Los 5 productos del artículo, en prod** — *Careless, con el app de Shopify.*
   Los del artículo «10 nyheter vi ønsker oss nå» (Cassia jakke, Hennie cardigan, Vilde genser,
   Sofie genser, Active pile fleece half-zip). Hoy en prod solo está la línea «Active». **Nadie de
   nuestro lado puede hacerlo**: tienen que exportarlos ellos desde `dignitycollect.myshopify.com`.
   Es el ítem de la lista con más plazo de terceros: **pedirlo hoy**.

5. **Productos publicados en el channel de Aller** — *equipo Vio / Angelo, tras el 3 y el 4.*
   `channel_user_products` de Careless está a 0. Hace falta: fila en `channel_user_products` para
   ese channel + `product.active = 1` (ya) + envío que cubra el país (ya) + `channel_group` para que
   campañas y dashboard vean la marca.

6. **Surface y campaña en prod** — *Angelo / equipo Vio, tras el 5.*
   La surface de Mote & Livsstil, el channel asignado y la campaña con Careless como sponsor. La
   comisión por defecto es 15 %.

7. **El Replit de Aller, en prod, con el SDK** — *Angelo.*
   Hoy el sitio publicado de `www.moteoglivsstil.no` **no tiene ni una referencia al SDK de Vio**:
   lo de Vio está solo en el entorno de desarrollo del Replit. Es la migración que Angelo mencionó.
   - **Decidir la versión y fijarla:** npm tiene **`@vio-live/web-sdk@0.27.0`**; el prompt que se le
     dio al agente de Replit el 21/10 dice **0.26.1**. Que Replit y Vev vayan a la **misma** versión,
     y que sea una ya probada en QA — no estrenar versión el lunes.
   - Sin `Vio.analytics.start` con consentimiento **no sale ningún evento**: es también el requisito
     para que el colector deje de estar a 0.

---

## 3. Calendario realista

Hoy es **jueves 22**. Quedan **dos días hábiles**: jueves y viernes. **Staging está apagado todo el
fin de semana** (y de 01:00 a 08:30 entre semana), así que el sábado y el domingo no se puede probar
nada en QA sin encenderlo a mano.

| Cuándo | Qué | Quién |
|---|---|---|
| **Hoy, jue 22** | Pedir a Careless la exportación de los 5 productos (plazo de terceros, lo primero) | Angelo |
| Hoy | Email de la cuenta de equipo Vio → le pongo Admin (bloqueante 1) | Angelo → Miguel |
| Hoy | Alta de Aller en prod + suscripción + rol Publisher | Angelo |
| **Vie 23** | Careless en partnership con su MSN (bloqueante 2) y comprobar que nace la fila `payment_method` | equipo Vio |
| Vie 23 | Channel de Aller, productos publicados, surface y campaña (3, 5, 6) | Angelo / equipo Vio |
| Vie 23 | **Pago real de prueba con Vipps en prod, importe mínimo** — el único que vale | Angelo |
| Vie 23, tarde | Replit de Aller a prod con la versión fijada del SDK (7) | Angelo |
| **Vie 23, cierre** | Congelar: nada de despliegues a prod desde el viernes por la tarde | todos |
| Sáb/dom | Solo observación. Si hay que probar en QA, **encenderlo a mano** | — |
| **Lun 26** | Publicar el artículo y vigilar la primera hora | todos |

**Recomendación fuerte:** el ensayo completo (bloqueantes 1–7 más el pago real) debe estar hecho
**el viernes**, no el lunes. El lunes se publica algo ya probado; no se construye.

---

## 4. Qué hay que probar, y cuál es el criterio

### 4.1 El pago, que es lo que no se puede fingir

Lo verificado hasta ahora es que **nuestras claves autentican** y que **la firma del webhook se
comprueba**. Lo que **no** está ejercitado es un pago de verdad de punta a punta en producción.

1. **Un pago real con el importe más bajo posible**, desde la página, con Vipps, a un producto de
   Careless. Criterio: la orden queda con `seller_id` de Careless y el dinero aparece en la unidad
   **1179558** del portal de Vipps, **no** en la de Vio.
2. **La captura.** `captureType` es `ReserveCapture`: reserva primero y captura después. Decidir con
   Careless si capturan al enviar o al pagar — **esto sigue pendiente (D2 de Angelo)** y cambia
   cuándo se cobra de verdad.
3. **Una devolución real.** Careless ya suscribe `refunds/create`: una devolución en su Shopify
   **mueve dinero en Vipps**. Hay que avisarles **antes del lunes** (hallazgo 11 del 16/10, sigue
   sin hacerse). Si se enteran el martes por un reembolso inesperado, es un problema de confianza,
   no técnico.
4. **En el log de shopcart no debe aparecer** `[vippsEvent] … refused: signature mismatch`. Si
   aparece, la línea dice host, path y cuántos secretos se probaron.

### 4.2 La atribución y los datos

5. Compra atribuida completa: artículo → campaña → entrada → comprador. El colector debe pasar de
   `inserted: 0` a tener filas, y Mixpanel recibir el fan-out.
6. Aislamiento entre sponsors: con dos sponsors en los artículos de Aller, que lo de uno no se vea
   en el otro. En prod es donde de verdad se comprueba (en QA todas las brands cobran en la misma
   unidad de test).

### 4.3 Lo que ya está en manos de Alan

En el board Dev hay **10 tarjetas de QA abiertas**, casi todas del 19–20/10, incluida la de Aller
(`HPKysebB`, del 22/10) y la de Vipps de punta a punta (`W2NNShth`). **No van a estar todas cerradas
el lunes.** Hay que elegir: las que cubren el camino del lunes primero, el resto después.

Mi recomendación de prioridad: `n7R9WhVh` (compra atribuida de punta a punta), `tyByDaBK`
(Shopify + Vipps con orden atribuida), `oVs8bl5W` (cancelar y devolver). Las de WooCommerce, Stripe
Connect y estrés de Vev pueden esperar al martes.

---

## 5. Riesgos, ordenados por lo que cuestan

| # | Riesgo | Probabilidad | Mitigación |
|---|---|---|---|
| R1 | **El pago de Careless falla en el token** porque no se completó el paso 2 y cae a las claves de test | Alta si no se hace el viernes | Es el bloqueante 2. **Verificable antes**: con la fila creada, `payment_method` deja de estar a 0 y el log de shopcart muestra `mode:partner`, no `platform` |
| R2 | **Los 5 productos no llegan a tiempo** porque dependen de Careless | Media | Pedirlo hoy. Plan B: salir con los 40 productos «Active» que **ya están** en prod y cambiar el artículo, en vez de retrasar el go-live |
| R3 | **Nadie puede configurar nada** porque no hay Admin | Alta hasta que llegue el email | Un minuto de trabajo. Pedir **dos** cuentas Admin para no depender de una persona el lunes |
| R4 | **Moneda del envío**: la clase de envío de Careless está en **EUR** (`amount 10.00`, `currency_code EUR`) para país NO, con productos en **NOK** | Media | Comprobarlo en el checkout antes del lunes: si el total mezcla monedas, se ve en el primer pago de prueba. Es de las cosas que un pago de 1 corona destapa y un repaso visual no |
| R5 | **Un despliegue el lunes corta el servicio.** Medido: el deploy borra todos los pods por label, 62 s de 503 en prod incluso con 4 réplicas | Alta si alguien despliega | **Congelar prod desde el viernes por la tarde.** Si hay que tocar algo, `rollout restart` (rolling, sin corte), no el pipeline |
| R6 | **No hay backup offsite diario de prod**: el CronJob está roto por diseño y Angelo lo dejó así | Baja pero de impacto alto | **Tomar un dump a mano el viernes al cerrar**, con el estado bueno ya configurado. Es la red si hay que volver atrás el lunes |
| R7 | **Brands sin fila de Vipps fallan en silencio**: `scope=platform` ya no autentica (417) desde que prod apunta a `api.vipps.no` | Media | Solo afecta a brands sin configurar. Si entra otra brand, hay que pasarla por la página de partnership **antes** de que venda |
| R8 | **El colector no recibe nada** y nos enteramos el lunes | Media | Se comprueba sola con el punto 5: si `inserted` sigue a 0 después de la prueba, el SDK no está mandando (consentimiento o versión) |
| R9 | **Prod cuesta ~23 USD/día** y lleva encendida desde el 16/10 | Cierta | Dejarla encendida hasta el lunes es lo correcto. **No apagarla el fin de semana**: ahorrar 46 USD no compensa el riesgo de que no arranque bien el lunes |
| R10 | **Deriva de versiones del SDK** entre Replit (0.26.1), Vev y npm (0.27.0) | Media | Fijar una versión, la misma en los dos, ya probada en QA. Escribirla en el plan y no cambiarla el lunes |

---

## 6. Plan B y vuelta atrás

- **Si falla el pago el lunes:** apagar Vipps para Careless desde la página de partnership (deja de
  ofrecerse como método) en vez de tocar el entorno. Un cambio de `.env` cuesta un reinicio.
- **Si hay que revertir datos:** el dump a mano del viernes (R6). Sin él, lo único que hay son los
  backups automáticos de Azure con 35 días de retención y granularidad de punto en el tiempo.
- **Si el artículo sale mal:** el artículo es de Aller y se despublica desde su CMS. Nuestra parte se
  apaga pausando la campaña, que es reversible y no toca infraestructura.
- **Si hay que apagar todo:** `prod-power.sh commerce stop`, pero **recrear antes** el flag
  `PROD_DEBE_ESTAR_APAGADA` o el guardián diario no actúa.
- **Lo que NO hay que hacer el lunes:** desplegar, mergear a `master`/`main`, tocar `.env` de prod,
  ni reconstruir imágenes. Todo eso tiene corte de servicio o no se puede verificar a tiempo.

---

## 7. Recomendaciones y mejoras

**Para el lunes (baratas y que quitan riesgo):**

1. **Dos cuentas Admin de equipo Vio**, no una. Si la única persona con acceso no está, no hay
   manera de configurar ni de apagar nada por el dashboard.
2. **Ensayo general el viernes**, con pago real de 1 corona y su devolución. Es la única prueba que
   vale; el resto es inferencia.
3. **Dump de la base al cerrar el viernes**, con el estado bueno ya configurado.
4. **Congelación de prod desde el viernes por la tarde**, anunciada a todos los que pueden mergear.
5. **Avisar a Careless de lo de las devoluciones** antes del lunes. Lleva pendiente desde el 16/10.
6. **Fijar la versión del SDK** por escrito y usar la misma en Replit y Vev.
7. **Una ventana de vigilancia** el lunes: la primera hora, alguien mirando el log de shopcart, el
   `inserted` del colector y el portal de Vipps.

**Después del lunes (no antes):**

8. **Arreglar el backup offsite** (hornear `mysqldump` en la imagen, `inject: false`). Hoy el backup
   diario de prod no existe.
9. **Private endpoint de la MySQL de prod**: sigue pendiente desde el 12/10.
10. **Alertas**: hoy nos enteramos de las cosas mirando. Un aviso por `signature mismatch` en
    shopcart y por `inserted` plano en el colector valdría más que un dashboard.
11. **Limpieza del canal WordPress** y de las rutas Vipps legacy (ya apuntado en los diferidos).
12. **Datadog**: la clave vive pero `dd-trace` no se invoca nunca. Si vamos a tener clientes reales,
    conviene tener trazas antes del siguiente go-live.

---

## 8. Reparto

- **Angelo:** pedir los 5 productos a Careless (hoy), alta de Aller, surface y campaña, migración del
  Replit a prod, pago de prueba, avisar a Careless de las devoluciones, decisión D2 (modo de captura).
- **Miguel (infra/config/PRs):** Admin en prod en cuanto llegue el email, dump del viernes,
  verificación de que la fila de Vipps nace bien y que el webhook entrega, vigilancia del lunes,
  congelación. **No toco el flujo funcional** ni creo cuentas de cliente.
- **Claude:** lo que quede de código y PRs; nada nuevo a prod después del viernes.
- **Alan:** las tres tarjetas de QA del camino del lunes, en ese orden; el resto después.
- **Cualquier agente disponible:** nada de esta lista entra en prod sin que Angelo lo pida.

---

## 9. La pregunta incómoda

Con el estado de hoy, **el lunes es alcanzable pero no holgado**: de los 7 bloqueantes, 5 dependen
de que Angelo y el equipo de Vio hagan trabajo de configuración que todavía no empezó, y uno (los
productos) depende de un tercero. Lo que yo puedo hacer está hecho o es de un minuto.

Si el viernes por la tarde no hay **un pago real cobrado en la unidad de Careless**, mi
recomendación es **salir el lunes con el artículo sin compra** (contenido y analítica, que no mueven
dinero) y activar el pago cuando esté probado. Perder un día de ventas se recupera; un primer pago
que falla delante de Aller y de Careless, no.
