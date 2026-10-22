---
title: Noche del 22/10 — migracion de prod, import de Careless y channel de Aller con Vipps vivo
last-updated: 2026-10-23
owner: Miguel
---

## Lo que se cerro entre las 23:40 y las 00:30 — Miguel

Disparado por Angelo: «el lunes todo tiene que estar arriba asi que lo que haya que hacer lo
hacemos ahora». Todo en **produccion**.

### B7b — migracion `BrandProfilePolicyUrls1792500000000` CORRIDA EN PROD

**El riesgo de orden ya no existe.** Antes: si cualquier servicio de prod subia al kernel 1.0.282
sin migrar la base, toda lectura de `brand_profile` reventaba con `Unknown column 'bp.terms_url'`
(lo leen `api` — la pagina de Vipps —, `campaigns` y `collections`). Ahora la base esta migrada, asi
que **el kernel se puede desplegar en cualquier orden**.

- Script: `assets/2026-10-22-brand-policy-urls/m-brand-policy-urls-prod.js`, sin modificar.
- Pre-comprobado (solo lectura): columnas 0/2, fila de `migrations` 0, `brand_profile` **0 filas**,
  PRIMARY sobre `brand_user_id` (el upsert no puede duplicar), y el `user` 1327 es `@careless` con
  `organization_number 928540650` — el mismo org que la unidad de Vipps 1179558.
- Resultado: `ALTER` aplicado, fila de `migrations` insertada, enlaces de Careless cargados.
  Columnas **9 y 10** detras de `secondary_color`, `varchar(2048)` nullable `utf8mb4_unicode_ci`:
  identico a QA.
- **2a pasada: no repite nada** (`columnas = 2/2`, `fila migrations = 1`, sin segundo ALTER).
- El codigo viejo que corre no se entera: `Unknown column` = 0 en `api` y `campaigns`,
  `api-ecom.vio.live/` 200, 14/14 deployments. Aditivas y NULL: la entidad del kernel actual no las
  conoce, no van en sus SELECT.

### B2 — los 9 productos del articulo, importados

`POST /shopify/import` del micro `products` con `{user:{id:1327}, ids:[...]}`.
**Ojo con la ruta:** `BASE_PATH` esta **vacio** en `products`, asi que es `/shopify/import`, no
`/product/shopify/import`. Un `GET /product/health` devuelve 500 y parece que el prefijo existe —
es mentira, cae en la ruta `/:productId/:userId`.

Importados (todos `ACTIVE`, publicados y con stock en su Shopify), ids de Vio 421318-421326:

| Shopify | Producto | Stock |
|---|---|---|
| 9448742355196 | Cassia jakke - Brun | 253 |
| 9448742387964 | Cassia jakke - Svart | 231 |
| 9457686970620 | Hennie cardigan - Beige | 145 |
| 9457687003388 | Hennie cardigan - Svart | 260 |
| 9450415882492 | Vilde genser - Brun | 146 |
| 9450415915260 | Vilde genser - Burgunder | 192 |
| 9438008672508 | Sofie genser - Brun | 170 |
| 9438008770812 | Active pile fleece half-zip - Brun | 163 |
| 9438009098492 | Active pile fleece half-zip - Beige | 345 |

Excluidos a proposito: `Hennie - Lys rosa` y `Lys bla` (sin publicar, stock 0), `Sofie - Lilla`
(stock 0), `Active pile fleece mann` (stock 0), y `Vilde bukse` (es pantalon, no el *genser* del
articulo). No se importaron los 1.729: solo lo del articulo.

Verificado en la base: los 9 `active=1`, 7 tallas cada uno con stock real y precio en NOK
(Cassia 1499,00).

**Trampa que encontre y arregle — el import solo engancha el metodo de envio POR DEFECTO.**
Los 9 nacieron con **1** fila de `product_shipping` (Helthjem) mientras los 40 viejos tienen **2**.
Sin la segunda, el checkout no ofrece Bring para estos productos. Anadidas las 9 filas que faltaban
(`f831b031...`, Bring). Ahora `product_shipping` de 1327 = **98 = 49 x 2**, y los 9 resuelven los dos
metodos. **Esto hay que repetirlo en cada import futuro**, no es cosa de una vez.

### La collection compartida, con los productos buenos

Careless estuvo trabajando en su dashboard a la vez (21:44 UTC): borro la collection del pilot
`eOy5cc5g4` y creo **`NnRsYSAaJ` "Carelles Test"**, con 5 items que seguian siendo todos de la linea
«Active» — porque los del articulo **no existian en Vio hasta el import de esta noche**. Eso era
exactamente la trampa de orden que estaba escrita en B2.

El borrado se porto bien: arrastro las shares 604/605 y Careless creo la **606** a Aller (1330).

Anadidos los 9 del articulo a `NnRsYSAaJ` **sin tocar sus 5** (14 items). No se borro nada suyo: si
quieren solo los del articulo, quitar los 5 «Active» es un minuto en su dashboard.
Verificado por el camino real: `GET /collectionShared/joined/1330` devuelve la collection con
**14 items**.

### B3 / B3b / B4 — el channel de Aller, y por que el interruptor de Vipps no basta

**Hallazgo que corrige el checklist: B3b no se puede cumplir por si solo.** `available-payment-methods`
llama a `resolveBrandOfChannel` -> `brandFor` -> `brandOfChannel({ownerId, productOwnerIds})`, y
`productOwnerIds` sale de `CHANNEL_PRODUCT_OWNERS_SQL`: las filas de **`channel_group`**
(product / variant / collection / collection_shared) o de `channel_user_products`. Con el channel
vacio, `owners` = [] y el brand cae en `ownerId` — o sea **Aller**, que no tiene `payment_method`.
Resultado: `[]`, sin boton, aunque `channel_user_settings.vipps = 1`.

Medido en vivo: `GET /channel/available-payment-methods/479` -> `200 []` con `vipps=1`.

O sea: **lo que abre el boton de Vipps es enganchar la collection compartida al channel (B4), no el
interruptor**. El interruptor es condicion necesaria, no suficiente.

Secuencia real de la noche (todo en UTC):
- 21:40:14 — alguien crea el channel **479** desde el dashboard, con `channel_group` 1075 -> share **605**
- 21:44:14 — Careless borra la collection del pilot: la share 605 muere y el grupo 1075 queda colgando
- 21:55:58 — se borra el channel 479 entero. **Aller se queda sin channel**
- ~21:56 — se crea el **480** "Careless 26/10 test", ya con `channel_group` 1076 -> share **606** (la buena)
- 22:2x — yo, sin ver el 480 todavia, creo el **481** por `POST /channel/user` + `POST /channel/group`.
  Duplicado mio: **lo borre** (`DELETE /channel/1330/481`, 200) al comprobar que el 480 ya servia.

**Estado final: un solo channel vivo.**

- `channel_user` **480**, user 1330 (Aller), `channel_id 10` (Sdk), activo
- api key **`DWWWP0S-8KA4WGZ-M9ABEGN-XZE3G4Y`** (es la que necesita el Replit, B6)
- `channel_user_settings`: `vipps = 1`, `markets ["NO","GB","NL"]`
- `channel_group` 1076 -> share 606 -> collection `NnRsYSAaJ` con 14 items
- **`GET /channel/available-payment-methods/480` -> `200 ["Vipps"]`** ← el criterio de B3b, cumplido

Dos detalles menores: el nombre lleva «test», y `markets` incluye GB y NL (el envio de Careless solo
cubre NO, asi que esos mercados no tendrian envio). Ninguno bloquea el lunes.

### C1 — dump de prod, hecho con dos dias de adelanto

Pod efimero `mysql:8.0` con `sidecar.istio.io/inject:"false"` (el CronJob sigue roto por diseno).
`prod-dump-golive-20261023.sql.gz`, **14.782.944 bytes**, `gzip -t` OK, **128/128 tablas**
(eran 119 el 12/10: las migraciones nuevas anadieron tablas). Contiene lo de esta noche: `terms_url`,
la fila `BrandProfilePolicyUrls1792500000000` y «Cassia jakke - Brun».
Subido a `containerproductionsc/db-backups/`, **MD5 del blob == MD5 local** (`hPeSGjoe8RS3rmSwAu9ctw==`).
Pod borrado.

### E2 — la version del SDK, con evidencia

npm `@vio-live/web-sdk` esta en **0.28.0** (`latest`), no 0.27.0. Y los eventos que staging esta
ingiriendo ahora mismo (`mote-livsstil-hub-vio.replit.app`) reportan **`sdk_version: 0.28.0`**: 46
eventos, 0 descartes, llegando a Mixpanel. O sea que **0.28.0 es la unica version con recorrido
end-to-end probado**, no una version a estrenar. Recomendacion: fijar 0.28.0 en Replit y en Vev.

### Lo que sigue necesitando a una persona

- **Segundo Admin:** no hay candidato valido en prod. El `1309` es la marca «Life», no una cuenta
  del equipo; el resto son cuentas de prueba de Alan. Hace falta que Angelo diga **que cuenta**
  (o cree una, como se hizo con la 1328).
- **A3/A4** (pago real de 1 kr y su devolucion), **B6** (Replit con el SDK y la api key de arriba),
  **C4/C5** (avisar a Careless de la devolucion que mueve dinero y del envio sin umbral).
