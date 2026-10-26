---
title: "Descripciones de producto en utf8mb4 — scripts de QA y prod"
last-updated: 2026-10-26
owner: angelo
status: live
---

# Descripciones de producto en utf8mb4 (`ProductDescriptionsUtf8mb41792700000000`)

**Problema (prod, 26/10).** Al añadir productos a una colección compartida, products-ms replica cada
producto como `custom_product` del otro usuario (`POST /add/custom-product`) copiando
`product.description` (utf8mb4) a `custom_product.description` (latin1). Tres productos de Careless
(421208, 421211, 421213) con un «✔» en la descripción fallaron con
`Incorrect string value: '\xE2\x9C\x94\xC2\xA0…' for column 'description'`.

**Arreglo.** Migración `src/migrations/1792700000000-product-descriptions-utf8mb4.ts` de
`package-database` (rama `fix/custom-product-utf8mb4`), que pasa a `utf8mb4` / `utf8mb4_unicode_ci`
(la colación de los títulos de esas mismas tablas), sin cambiar tipo (`text`), nulabilidad (NULL) ni
posición:

| Columna | Por qué |
|---|---|
| `custom_product.description` | el fallo de prod: copia de `product.description` |
| `custom_product.description_two` | descripción editada desde el dashboard (`/update/custom-product`); misma tabla, misma reconstrucción, coste cero |
| `channel_user_products.description` | la proyección de la colección por channel copia `product.description`; `cleanSpecialCharacteres` sólo quita ★, –, BOM y la diéresis combinada, un «✔» o un emoji rompen el INSERT igual |

Las demás columnas latin1 de esas tablas (`sku`, `barcode`, `tags`, `brand`, `origin`, …) se copian de
columnas que **también** son latin1 (`product.*`, `variant.*`): no pueden traer un carácter que no
quepa, así que no fallan por este camino y no se tocan. `collection.description` es texto del
usuario sobre la colección, no texto de producto: fuera de este cambio.

## Scripts

- `m-product-descriptions-utf8mb4-qa.js` — **corrido en QA el 2026-10-26 13:12 CET** (ver abajo).
- `m-product-descriptions-utf8mb4-prod.js` — **sin correr.** Idéntico salvo `.env` (prod) vs
  `.env.local` (QA) y el contexto en los comentarios.

Qué hacen: mismo SQL que el `up` de la migración (comprobado byte a byte); comprueban **antes de
escribir nada** que las tres columnas existen y son `text NULL`, y que ningún valor pasa de 65.535
bytes al convertirse; imprimen filas y MB de cada tabla; `ALTER` sólo de las columnas que no están
en utf8mb4; fila en `migrations` (`1792700000000`, `ProductDescriptionsUtf8mb41792700000000`) sólo si
falta; `lock_wait_timeout = 20` (si el ALTER no consigue el metadata lock en 20 s falla en vez de
encolar la tabla; se reintenta, es idempotente); al final, **INSERT de un «✔ » en las tres columnas
dentro de una transacción con ROLLBACK** (no deja filas; consume un id de auto-increment) y cuenta
que no quedan filas de prueba. No imprimen valores del `.env`.

## Cómo correrlo en prod

Requiere el OK explícito de Angelo para escribir en prod. El orden respecto del kernel no importa
para los micros (la entidad sólo declara el charset; `synchronize` está en `false`), pero la regla
del playbook es migración en el entorno **antes** de desplegar el kernel nuevo.

1. Backup reciente: `az mysql flexible-server backup list …` (ver playbook).
2. Plan, sin escribir nada — mirar filas y MB:

   ```bash
   kubectl --context vio-commerce-prod-sc -n default exec -i deploy/users -c users -- \
     env DRY_RUN=1 sh -c 'cd /usr/src/app && node -' < m-product-descriptions-utf8mb4-prod.js
   ```

3. En serio, fuera de hora punta:

   ```bash
   kubectl --context vio-commerce-prod-sc -n default exec -i deploy/users -c users -- \
     sh -c 'cd /usr/src/app && node -' < m-product-descriptions-utf8mb4-prod.js
   ```

4. Volver a correr el paso 3: debe decir «nada que convertir» y `fila migrations = 1`.
5. Reintentar el alta de los tres productos de Careless en la colección compartida.

**Bloqueo.** Cambiar el charset reconstruye la tabla (ALGORITHM=COPY): durante la copia se lee,
pero los INSERT/UPDATE a esa tabla esperan. En QA (MySQL 8.0.46-azure): `custom_product` 15.570
filas / 13,2 MB → **0,9 s**; `channel_user_products` 18.685 filas / 17,9 MB → **1,0 s**. Regla de
pulgar: ~15–20 MB/s en el servidor de QA; con los MB que imprima el DRY_RUN de prod se estima el
tiempo (el SKU de prod puede diferir).

Nunca `kubectl cp`: el script entra por stdin.

## Salida en QA (2026-10-26)

```
base outshifter | mysql 8.0.46-azure | fila migrations = 0
antes: custom_product filas=15570 (~13.2 MB) | description latin1/latin1_swedish_ci, description_two latin1/latin1_swedish_ci | por convertir: description, description_two
antes: channel_user_products filas=18685 (~17.9 MB) | description latin1/latin1_swedish_ci | por convertir: description
ALTER custom_product (description, description_two) aplicado en 0.9 s sobre 15570 filas
ALTER channel_user_products (description) aplicado en 1.0 s sobre 18685 filas
fila migrations insertada
después: custom_product | description utf8mb4/utf8mb4_unicode_ci, description_two utf8mb4/utf8mb4_unicode_ci
después: channel_user_products | description utf8mb4/utf8mb4_unicode_ci
prueba «✔ »: INSERT custom_product OK (id 16189), INSERT channel_user_products OK (id 25683), lectura idéntica = true
ROLLBACK hecho | filas de prueba que quedan = 0
migrations: ["ProductDescriptionsUtf8mb41792700000000","ProductCategoryUnique1792600000000"]
```

Segunda y tercera pasada (la tercera ya con `lock_wait_timeout`): «nada que convertir», sin ALTER, la
prueba con ROLLBACK pasa.

Antes de QA se probó en MySQL 8.0 en Docker: con la tabla en latin1 el INSERT de «✔ » reproduce
exactamente el error de prod; tras el `up`, entra (también un emoji, porque los micros conectan con
mysql2 1.5.2, charset por defecto `UTF8MB4_UNICODE_CI`); el dato latin1 existente («Størrelse – blå»)
se conserva; `down` vuelve a latin1 y falla, como se espera, si ya hay texto fuera de latin1.
