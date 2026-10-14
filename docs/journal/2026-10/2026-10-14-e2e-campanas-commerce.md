---
title: "2026-10-14: prueba de punta a punta de campañas en Commerce, de la brand a la orden en Vev"
date: 2026-10-14
session: full-day
participants: [angelo, claude, miguel]
status: live
---

# Prueba de punta a punta: de la brand a la orden pagada en Vev, sin vio-backend

## Goal
Terminar el 14/10 el flujo completo de campañas en Commerce, sin vio-backend: una brand carga
productos y pago, crea y comparte una colección, un publisher arma su channel, su surface y su
campaña, Vev muestra la campaña y entra una orden pagada. Después, la ronda de mejoras que salió
de probarlo.

- **Quién:** Angelo (pruebas en el dashboard y en Vev, decisiones), Claude (coordinación, código vía agentes, verificación en la base de QA) y Miguel (TypeORM del micro y corte de `api-staging`).
- **Dónde:** QA (`kubernetesqa-sc`, MySQL de QA), dashboard de staging y Vev (paquete compartido).
- **Guía:** [playbook e2e-campanas-commerce](../../playbooks/e2e-campanas-commerce.md).

## Resultado

**Orden 4551, pagada desde una página de Vev.** Cumple ADR-0026 y ADR-0028 de punta a punta:

| | |
|---|---|
| Config del SDK | `api-staging.vio.live/v2/mobile/config` (micro), surface 3 "Vev", campaña 2 "Test vev" |
| Checkout | SUCCESS, Vipps, 219 NOK, `total_tax` 43,80 |
| Quién cobró | **brand 1289**, modo `partner` (MSN 545865) |
| Carrito | `user_id` 1312 (Aller, publisher), **`seller_id` 1289** |
| Orden | reseller 1312, **`channel_user_id` 505**, envío Express 0 NOK |
| Ítem | producto 408949, supplier 1289, PROCESSING |

Antes, por API, hubo órdenes de control: 4548, 4549 y 4550, sin F2, cobradas por la unidad de Vio. En la 4548 apareció el bug del envío en EUR.

## Lo que se hizo en el día, en orden

1. **Preparación de madrugada:** el playbook, verificado por cuatro agentes contra el código.
2. **Micro TypeORM** (Miguel, PR #7): las surfaces y campañas quedan en `surface_*`.
3. **Flujo por API:** brand (`isBusiness`, producto, colección, compartir) → channel 504 → surface y campaña → órdenes 4548-4550.
4. **Arreglo de envío y `total_tax`:** products #22, webapp #52, shopcart #88 y graphql #24.
   - El envío de la brand estaba en EUR en una cuenta NOK.
   - `total_tax` se calculaba encima del bruto.
5. **Reset de la conexión entre 1289 y 1312**, y el flujo de nuevo desde el dashboard: conexión, channel 505, surface 3, campaña 2.
6. **ADR-0030:** `api-staging` pasa por DNS al micro, sin migrar. Hosts: Vio API en `api(-staging)` y Commerce en `api-ecom`/`graph-ql`. Corte hecho por Miguel.
7. **Ronda de mejoras:**
   - campaña sin pasar por la surface: micro #8 y webapp #53;
   - "accepted" solo a quien envió la solicitud: api #44;
   - modales que no pierden lo cargado: webapp #53;
   - el sponsor no muestra el email: micro #8;
   - GraphQL 401 en vez de 500: graphql #25;
   - productos con variantes que no se podían publicar (bug de Alan): webapp #54.
8. **F2 desplegado:** api #45, base-api #32, users #21, middleware #10, payment-processors #12, orders #21 y shopcart #87. Los locks se resolvieron mergeando develop, sin token npm. Desde aquí el channel ofrece los métodos de la brand y cobra la brand.
9. **Vev:** el sponsor sale de la config de la key y cambiar de key funciona (vev #61). Desplegado en el paquete compartido **0.326**, con rollback a la 0.325.
10. **Orden 4551 desde Vev.** ✅

## Después de la orden 4551 (tarde)

- **ADR-0031, pagos de la brand filtrables por channel** (pedido de Angelo: "como un filtro; en
  iOS nativo solo funciona uno"): api #46, base-api #33, webapp #55. Verificado: el channel 505
  ofrece Vipps.
- **`ACCOUNT_PAYMENTS` encendido en Vercel staging** (Miguel): la brand enciende sus métodos en
  Settings › Payments. El dominio de staging no seguía a develop por el entorno custom; Miguel lo
  arregló y escribió la [lección](../../lessons/dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md).
- **ADR-0032, precio de productos con variantes** (reporte de Alan: Woo variable → "0 NOK"):
  - la causa era el plugin `vio-woocommerce-sync`;
  - products #23 deriva el mínimo cuando falta, con herencia solo en nativos;
  - **backfill aplicado en QA: 333 productos**;
  - webapp #54 y #56 en el dashboard;
  - plugin #1 abierto (falta el test con wp-env y el release en wp.org).
- **Alan:** [tarjeta de Trello](https://trello.com/c/ftrrjOW0) con el contexto, el checklist del
  flujo, el checklist "Pagos: flujos a estresar" y avisos de cada arreglo.
- **Hallazgos de seguridad**, con tareas aparte:
  - en base-api, `/api/role/add` no pide token ni rol admin;
  - en graphql, la auth se salta por el nombre de operación `GetPurchaseConditions`;
  - shopcart tiene `.env.local.qa` commiteado.

## Decisions
- [ADR-0030](../../decisions/0030-api-staging-por-dns-al-micro-y-hosts-vio-api-vs-commerce.md):
  `api-staging` por DNS al micro, sin migrar. Vio API frente a Commerce.
- [ADR-0031](../../decisions/0031-pagos-de-la-brand-filtrables-por-channel.md): los pagos son de la
  brand y el publisher filtra por channel.
- [ADR-0032](../../decisions/0032-precio-de-productos-con-variantes.md): el precio de un producto
  con variantes es el mínimo cuando falta, y la herencia solo en nativos.
- Sin migración de las surfaces viejas de staging (Angelo: "no hace falta migrar nada").
- La prueba se corre con todo arriba, sin apagar vio-backend (Angelo).

## Blockers / Next session

El estado completo y el siguiente paso de cada cosa están en el [handoff](../../handoff/2026-10-14-campanas-handoff.md).


- **Ronda de mejoras** (en el [plan](../../handoff/campanas-en-commerce-plan-de-ejecucion.md)):
  - punto 3, brand↔brand, se recuenta después del backfill de users F2.2;
  - punto 4, las 19 clases de envío en otra moneda;
  - la carrera del bootstrap en `vio-web-sdk`;
  - la mejora de products-ms para derivar el precio de las variantes.
- **Backfill del rol Publisher** (`POST /admin/backfill-publisher-roles`, primero en dry-run) con un admin.
- **`ACCOUNT_PAYMENTS` en Vercel staging:** la brand gestiona sus pagos a nivel de cuenta.
- **Alan:** prueba y estrés del flujo completo ([tarjeta](https://trello.com/c/ftrrjOW0)). Su loop de VG necesita una surface nueva en el dashboard.
- **Prod:** el mismo corte (ADR-0029/0030) cuando se decida.
