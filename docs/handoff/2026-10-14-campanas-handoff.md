---
title: "Handoff — campañas en Commerce, estado al cierre del 14/10"
last-updated: 2026-10-14
owner: angelo
status: live
---

# Handoff: campañas y surfaces en Commerce (14/10)

> **Para quien sigue** (otro agente u otra persona): este doc es el punto de entrada. Léelo entero
> antes de tocar nada. El detalle está en los docs enlazados; aquí van el estado, lo que está en
> curso y lo que falta, con el siguiente paso concreto de cada cosa.

## Dónde leer

| Qué | Doc |
|---|---|
| Decisiones | ADR [0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) a [0031](../decisions/0031-pagos-de-la-brand-filtrables-por-channel.md). Las de hoy: **0030** (`api-staging` por DNS al micro, Vio API frente a Commerce) y **0031** (pagos de la brand, filtrables por channel) |
| Plan, fases y ronda de mejoras | [campanas-en-commerce-plan-de-ejecucion](./campanas-en-commerce-plan-de-ejecucion.md) |
| Prueba de punta a punta, paso a paso | [playbook e2e-campanas-commerce](../playbooks/e2e-campanas-commerce.md) |
| Lo que pasó el 14/10 | [journal 2026-10-14-e2e-campanas-commerce](../journal/2026-10/2026-10-14-e2e-campanas-commerce.md), más los journals por repo del mismo día |
| Infra del micro y corte | [micro-campanas-infra](./micro-campanas-infra.md) (§9b, corte de `api-staging`) |

## Estado en QA (verificado el 14/10)

- **El flujo de punta a punta funciona.** La orden 4551 se pagó con Vipps desde Vev y **cobró la brand**: 1289 en modo partner, `cart.seller_id` 1289, `order.channel_user_id` 505 y reseller 1312.
- **`api-staging.vio.live` es el micro de campañas** (ADR-0030, corte por DNS hecho por Miguel). Ojo: QA se apaga de noche y los fines de semana, y `api-staging` con él.
- **F2 desplegado:** api #45, base-api #32, users #21, middleware #10, payment-processors #12, orders #21 y shopcart #87.
- **Ronda de mejoras desplegada:**
  - micro #8: la campaña asigna su channel a la surface, el nombre del sponsor no es el email y `GET /api/channels`;
  - webapp #53 (formulario de campaña y modales), webapp #54 (publicar con variantes desde el dashboard);
  - api #44 (`REQUEST_ACCEPTED` solo al sender) y graphql #25 (401 en vez de 500);
  - products #22, webapp #52, shopcart #88 y graphql #24 (moneda de envío, `total_tax` y descripciones neto/bruto).
- **Vev:** paquete compartido `cq1lXld-TA9` en la **0.326** (vev #61, el sponsor sale de la config de la key). Rollback: `vev restore` a la 0.325.

**Cuentas y datos de prueba en QA:**
- **Brand:** Fredrik & Louisa (1289, `is_business=1`, Vipps partner MSN 545865, envíos Express 0 NOK y Standard 100 NOK). Se muestra como "Fedrik Louisa".
- **Publisher:** Aller (1312), con el channel 505, la surface 3 "Vev" y la campaña 2 "Test vev".

## En curso al escribir esto (lo actualizo al cerrar)

| Qué | Repo / rama | Estado |
|---|---|---|
| Precio del producto = mínimo de las variantes cuando falta (todas las fuentes), con backfill de los 333 de QA | products-ms `fix/precio-desde-variantes` | agente trabajando |
| El plugin de Woo manda el precio de los productos variables | `vio-woocommerce-sync` `fix/precio-desde-variantes` | agente trabajando. **Publicarlo en wp.org es aparte** (playbook `wordpress-org-plugin-release`) |
| ADR-0031: filtro de pagos por channel | api y base-api `feature/pagos-filtro-por-channel`, webapp, misma rama | agentes trabajando |

## Pendiente (siguiente paso concreto)

1. **Backfill del rol Publisher** (users F2.2): `POST /admin/backfill-publisher-roles` con un admin, primero en dry-run. Después, recontar las conexiones "brand↔brand" (mejora 3 del plan).
2. **`ACCOUNT_PAYMENTS=true` en Vercel staging**, y redeploy (Miguel). Así la brand gestiona sus pagos de cuenta en Settings › Payments.
3. **La carrera del bootstrap en `vio-web-sdk`:** un bootstrap viejo en vuelo pisa el nuevo. Se arregla con un contador de generación y rebundleando en Vev.
4. **SDK y Vev: mostrar "fra X"** con el mínimo de las variantes si el producto llega en 0. Es defensa extra; con products-ms ya no debería pasar.
5. **Clases de envío en otra moneda:** 19 en QA. Dos son de Alan (1295 y 1299) y las arregla él; el resto son cuentas de prueba viejas.
6. **Alan:** prueba y estrés de todo, en su [tarjeta de Trello](https://trello.com/c/ftrrjOW0). Su loop de VG necesita una surface nueva en el dashboard.
7. **Prod:** el mismo corte (ADR-0029/0030), F2, las migraciones del kernel (con el `group_concat_max_len` de la revisión de Miguel) y `PAYMENT_SECRETS_KEY`. Nada de esto está en prod.
8. **Hallazgos de seguridad** (tareas aparte, sin hacer):
   - en base-api, `/api/role/add` no pide token ni rol admin;
   - en graphql, la auth se salta con la operación `GetPurchaseConditions`;
   - shopcart tiene commiteado `.env.local.qa` con secretos.

## Reglas que siguen valiendo

- **PRs y merges** en repos de código, con OK de Angelo. Angelo da OK en lote ("mergea y sube"), pero **un cambio sobre trabajo de Alan necesita confirmación explícita**.
- **El handbook se pushea siempre.** Sin `Co-Authored-By` en los commits. No imprimir `.env`.
- **Token npm local en 401:** los locks se resuelven mergeando develop (el kernel ya va en 1.0.270), o lo hace Miguel.
- **Consultas a la base de QA:** solo lectura, con un script copiado al pod de `users` (`kubectl exec`, kubeconfig de QA) y borrado al terminar.
