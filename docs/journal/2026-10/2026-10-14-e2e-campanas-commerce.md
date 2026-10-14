---
title: "2026-10-14: prueba de punta a punta de campañas en Commerce, de la brand a la orden en Vev"
date: 2026-10-14
owner: angelo
---

# Prueba de punta a punta: de la brand a la orden pagada en Vev, sin vio-backend

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

## Lo que queda

- **Ronda de mejoras** (en el [plan](../../handoff/campanas-en-commerce-plan-de-ejecucion.md)):
  - punto 3, brand↔brand, se recuenta después del backfill de users F2.2;
  - punto 4, las 19 clases de envío en otra moneda;
  - la carrera del bootstrap en `vio-web-sdk`;
  - la mejora de products-ms para derivar el precio de las variantes.
- **Backfill del rol Publisher** (`POST /admin/backfill-publisher-roles`, primero en dry-run) con un admin.
- **`ACCOUNT_PAYMENTS` en Vercel staging:** la brand gestiona sus pagos a nivel de cuenta.
- **Alan:** prueba y estrés del flujo completo ([tarjeta](https://trello.com/c/ftrrjOW0)). Su loop de VG necesita una surface nueva en el dashboard.
- **Prod:** el mismo corte (ADR-0029/0030) cuando se decida.
