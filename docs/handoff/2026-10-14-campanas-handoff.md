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
| Decisiones | ADR [0025](../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) a [0032](../decisions/0032-precio-de-productos-con-variantes.md). Las de hoy: **0030** (`api-staging` por DNS al micro, Vio API frente a Commerce), **0031** (pagos de la brand, filtrables por channel) y **0032** (precio de productos con variantes) |
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

## Hecho después del primer cierre (14/10, tarde)

| Qué | Dónde | Estado |
|---|---|---|
| **ADR-0031**: el publisher filtra qué métodos de la brand se ven en cada channel | api #46, base-api #33, webapp #55 | ✅ en QA. El channel 505 ofrece Vipps; `GET /api/channel/:id/payment-methods` sin token da 401 |
| **Precio de productos con variantes**: si falta, el mínimo de las variantes; la herencia solo en NATIVE | products #23 | ✅ en QA. **Backfill aplicado: 333 productos** (301 Woo, 10 Magento y 22 nativos), 0 errores, idempotente. El 411959 de Alan pasó a 110 NOK |
| Plugin de Woo: el producto variable manda el precio de su variación más barata | vio-woocommerce-sync **#1** | ⏳ **PR abierto sin mergear.** Falta correr `tests/ProductMapperTest.php` con wp-env, mergear y publicar en wp.org con un tag (playbook `wordpress-org-plugin-release`). Mergear no publica: el deploy corre solo con un tag |
| Dashboard: en importados, una variante en 0 sale "Not for sale" (alinea #54 con products #23) | webapp #56 | ✅ en staging |
| `ACCOUNT_PAYMENTS=true` en Vercel staging | Miguel | ✅ encendido. Verificado en el bundle de las 17:06 UTC. El dominio se quedaba en builds viejos porque el proyecto usa un **entorno custom** `staging` y el dominio estaba atado por `gitBranch`. Miguel lo ató por `customEnvironmentId` y ahora sigue a develop solo. Ver la [lección](../lessons/dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md) |

**Backfill de precios:** se corre con `node dist/scripts/recompute-variant-prices.js` en el pod de products, anteponiendo `PROCESS_ENV=local` (el pod usa `.env.local`). Es dry-run por defecto; `--apply` escribe. Filtros: `--ids`, `--user`, `--limit`, `--json`.

## Pendiente (siguiente paso concreto)

1. **Backfill del rol Publisher** (users F2.2): `POST /admin/backfill-publisher-roles` con un admin, primero en dry-run. Después, recontar las conexiones "brand↔brand" (mejora 3 del plan).
2. ✅ ~~`ACCOUNT_PAYMENTS=true` en Vercel staging~~, hecho el 14/10. Después de tocar variables o dominios en Vercel, verificar que `dashboard-staging` sirva el último commit de develop. La causa de que no lo hiciera está en la [lección de Miguel](../lessons/dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md).
3. **La carrera del bootstrap en `vio-web-sdk`:** un bootstrap viejo en vuelo pisa el nuevo. Se arregla con un contador de generación y rebundleando en Vev.
4. **SDK y Vev: mostrar "fra X"** con el mínimo de las variantes si el producto llega en 0. Es defensa extra; con products-ms ya no debería pasar.
5. **Precio "desde" que queda viejo:** si se borra la variante más barata de un producto con precio derivado, no se recalcula, porque no hay columna que distinga un precio derivado de uno explícito. Hace falta `price_derived` en package-database (con OK de Angelo y release `pkg=all`).
6. **¿Qué hace shopcart con una variante en 0 de un producto importado?** Hay que confirmar que no se pueda comprar a 0.
7. **Borrar el flag `ACCOUNT_PAYMENTS`** cuando F2 esté en prod y encendido en los dos entornos.
8. **Clases de envío en otra moneda:** 19 en QA. Dos son de Alan (1295 y 1299) y las arregla él; el resto son cuentas de prueba viejas.
9. **Alan:** prueba y estrés de todo, en su [tarjeta de Trello](https://trello.com/c/ftrrjOW0). Su loop de VG necesita una surface nueva en el dashboard.
10. **Prod:** el mismo corte (ADR-0029/0030), F2, las migraciones del kernel (con el `group_concat_max_len` de la revisión de Miguel) y `PAYMENT_SECRETS_KEY`. Nada de esto está en prod.
11. **Hallazgos de seguridad** (tareas aparte, sin hacer):
   - en base-api, `/api/role/add` no pide token ni rol admin;
   - en graphql, la auth se salta con la operación `GetPurchaseConditions`;
   - shopcart tiene commiteado `.env.local.qa` con secretos.

## Reglas que siguen valiendo

- **PRs y merges** en repos de código, con OK de Angelo. Angelo da OK en lote ("mergea y sube"), pero **un cambio sobre trabajo de Alan necesita confirmación explícita**.
- **El handbook se pushea siempre.** Sin `Co-Authored-By` en los commits. No imprimir `.env`.
- **Token npm local en 401:** los locks se resuelven mergeando develop (el kernel ya va en 1.0.270), o lo hace Miguel.
- **Consultas a la base de QA:** solo lectura, con un script copiado al pod de `users` (`kubectl exec`, kubeconfig de QA) y borrado al terminar.
