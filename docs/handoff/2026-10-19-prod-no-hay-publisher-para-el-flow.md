---
title: "Prod: no hay publisher, y el backfill de roles no se puede llamar"
date: 2026-10-19
owner: miguel
decides: angelo
status: live
---

# Prod: por qué no se puede correr el flow de campañas con clientes reales

**Contexto.** Angelo (19/10): *«haré todos los pasos con clientes reales para probar el flow»*. La
infra está completa — migración `source`, micro 1.0.275, D2 — pero la cadena del publisher no
arranca. Todo lo de abajo está **medido en prod y comparado con QA**, no inferido de docs.

## El problema, en tres datos

1. **`user_role` está vacío en prod** (0 filas; en QA hay 470). La tabla `role` sí tiene las tres
   filas (Admin 1, Supplier 2, Publisher 3).
2. **Los 9 clientes reales tienen `is_business = 1`**, así que los nueve derivan a **`brand`**:
   Kondomeriet (1305), Nytelse (1306), Beta (1307), Boots (1308), Life (1309), Villoid (1323),
   gladkokken (1324), Makeupmekka (1325), Careless (1327). Para retailers eso es **correcto**, no
   hay nada que arreglar ahí.
3. **Las únicas 8 cuentas con `is_business = 0` son cuentas de prueba de Alan** de junio–agosto
   (`alan-*@test.no`, `nuevo-usuario@test.no`, `shopify-user-to-submit@test.no`).

**Conclusión: no existe ningún publisher en prod.** Y `brand` sólo trae
`surfaces:read-footprint` y `campaigns:read-footprint` — **sin `surfaces:manage` ni
`campaigns:manage`**. Sólo `publisher` e `internal` los tienen
(`FEATURES_BY_ACCOUNT_TYPE`, idéntico en users y en el micro).

## Por qué no vale con los claims de Firebase

Hay una diferencia entre los dos servicios que importa mucho:

- **El micro de campañas** (`src/adapters/commerce/account-type.ts`) **sí** tiene fallback a claims:
  si la base no dice nada, `claims.channel === true` → `publisher`.
- **users** (`src/modules/user/helpers/account-type.ts`, rama `master`) **no**: *«Sin ninguna señal
  en la base → `null` y sin features: los claims de Firebase no cuentan acá (la base es la verdad,
  ADR-0008); el backfill los pasa a la base»*.

Como el dashboard gatea la navegación por lo que devuelve `/api/users/me` (que sale de users), **una
cuenta con el claim pero sin fila en `user_role` no ve Surfaces ni Campaigns**, aunque el micro la
aceptara. Esto se ve en QA: las cuentas que de verdad tienen surfaces (`allermedia` 1312,
`newsellerv2testno` 1332) **no tienen el rol Publisher** — viven del fallback de claims del micro.
En QA sólo 1 cuenta tiene el rol 3, y no tiene ninguna surface.

## El backfill existe, está bien hecho… y no se puede llamar

`PublisherBackfillService` (F2.2) es exactamente la herramienta para esto: recorre las identidades de
Firebase, y a las que tienen claim de channel/publisher **y no son business** les crea el `UserRole`
con el rol 3. Es idempotente, no reactiva roles desactivados a mano, y **por defecto es dry-run**
(sólo `{"data":{"dryRun":false}}` escribe). Las cuentas business las deja en `conflicts` sin tocar.

- Ruta: `POST /admin/backfill-publisher-roles`, `@UseGuards(AdminGuard)`.
- **Verificado que está en el pod de prod**, no sólo en el repo:
  `grep -l 'backfill-publisher-roles' /usr/src/app/dist/...` da
  `dist/modules/user/controllers/admin.controller.js`.

**Pero `AdminGuard` exige un ID token de Firebase de una cuenta con el rol Admin (1) en la base.** Y
en prod `user_role` está vacío, así que **ninguna cuenta es admin y el endpoint es inalcanzable**.
Es un arranque en frío: la primera fila de `user_role` hay que sembrarla en la base, no hay otra vía.

Nota aparte: aunque se pudiera llamar, el backfill **no** convertiría a ningún cliente real en
publisher — los nueve tienen `is_business = 1` y caerían en `conflicts`. Eso es correcto por diseño.

## Lo mínimo para desbloquear, en orden

1. **Sembrar un Admin** (una fila, reversible), para la cuenta que Angelo diga:
   `INSERT INTO user_role (active_user_role, user_id, role_id_role) VALUES (1, <id>, 1);`
   Esa cuenta pasa a `internal`, que ya trae `surfaces:manage` y `campaigns:manage` — con eso solo
   ya se puede crear surface y campaña — y además **destraba el endpoint del backfill**.
2. **Dar de alta el publisher por el flujo normal** (registro como Channel/Publisher). Así nace con
   `is_business = 0` y el claim `channel`, que es el estado que tienen los publishers que funcionan
   en QA. Después, correr el backfill **primero en dry-run** y leer el informe, y sólo entonces con
   `dryRun: false` para que el rol quede en la base y el dashboard le muestre las secciones.
3. **Las brands no se tocan.** Los nueve clientes reales ya resuelven a `brand`, que es lo que les
   corresponde.

## Lo que NO hay que hacer

**No convertir un cliente real en publisher.** Pasar Boots o Villoid a `publisher` le quita
`commerce:manage` y `brand:manage`: perdería la gestión de su catálogo. Si hiciera falta que una
cuenta real vea y gestione todo, el rol correcto es **Admin (internal)**, no Publisher.

## Decisión pendiente de Angelo

- Qué cuenta recibe la fila de Admin.
- Quién es el publisher de la prueba: cuenta nueva registrada por el flujo normal (recomendado) o
  una existente.

Mientras eso no esté, el resto de la cadena (Connections → Channels → Surfaces → Campaigns) no se
puede ni empezar.
