## 1,58 millones de imagenes huerfanas en prod: limpiadas y con barrido automatico — Miguel

- Quien: Miguel. Angelo: "necesitamos una solucion robusta ya para eso".
- Donde: base de produccion `vio-ecom-db-prod-sc`, tabla `image`; cluster `vio-commerce-prod-sc`
- Cuando: 2026-11-03, 17:15-17:50
- Contexto: buscando la causa de los abortos de `products` encontre que el **98% de la tabla
  `image` eran filas inalcanzables**.

### El hallazgo

- `image`: **1.792.119 filas**, 1.619.107 vivas, **328 MB**
- **1.583.765 vivas sin `product_id` y sin `variant_id`** = **98%** de lo vivo
- Con producto: 29.889 · con variante: 5.453
- Se seguian creando: de los ultimos 50.000 ids, **42.684 huerfanas (85%)**
- Una misma URL huerfana repetida **249.601** veces; otra 210.033
- Ids desde 238.725: **viene de lejos**, no es de hoy

### Antes de llamarlo basura lo comprobe

1. **`image` solo tiene dos claves ajenas** (`product_id` -> `product`, `variant_id` -> `variant`)
   y **no hay tabla puente** (`information_schema.KEY_COLUMN_USAGE`). `category_images` y
   `custom_product_image` son tablas distintas.
2. **Nadie las lee.** En todo `vio-products-microservice` la **unica** lectura del repositorio de
   imagenes es `replaceFeedImages`, y filtra por `owner` (producto o variante):
   `this._imageRepository.find({ where: owner })`. **No existe ninguna busqueda por URL**, asi que
   borrar estas filas no puede provocar re-subidas ni fallos de dedupe.

Con las dos cosas comprobadas: son inertes. (La leccion de no confundir pendiente con basura se
aplica al reves aqui: lo que hay que comprobar es que NADIE las alcance, y se comprueba, no se
supone.)

### Red de seguridad antes de borrar

El `db-backups` de `containerproductionsc` tenia su ultima copia del **22/10** y me dio un susto.
Falsa alarma: el CronJob `mysql-prod-offsite-backup` **si corre** y escribe en **otra cuenta**,
`viodbbackupwe/mysql-prod`. Copias diarias sanas, la de hoy `outshifter-20261103T021503Z.sql.gz`
de 16,6 MB a las 02:15. **Y el tamano de esas copias crecia cada dia** (14,8 -> 16,6 MB en cuatro
dias), justo por estas filas.

### Lo que hice

1. **Borrado por lotes** desde un pod de users: `DELETE ... LIMIT 5000` con 120 ms de pausa.
   **318 lotes, 1.584.062 filas, 163 segundos.** CPU de la base antes al 5-15%: ni se noto.
2. **`OPTIMIZE TABLE image`** (InnoDB lo convierte en recreate + analyze): **328 MB -> 44 MB en
   3 segundos**. 284 MB recuperados.
3. **Barrido automatico horario**, que es la parte "robusta": CronJob **`image-orphan-sweep`**
   (`20 * * * *`), imagen `mysql:8.0`, `sidecar.istio.io/inject: "false"`, credencial reutilizada
   del Secret `db-backup-creds`, `concurrencyPolicy: Forbid`. Borra en lotes de 2.000 con tope de
   **60.000 por pasada** (a ~360/hora sobra, y acota el dano si algo se desmadra).
   **Probado en el momento, no "creado y a esperar":** `kubectl create job --from=cronjob/...`
   -> encontro **53 huerfanas creadas en los 10 minutos posteriores a la limpieza** y las borro,
   `quedan=0`. Eso ademas **confirma que el bug sigue vivo**, a unas 320 filas/hora.
4. Copie el patron del CronJob de backup que ya funciona (misma imagen base de idea, istio off,
   credencial por Secret) en vez de inventar uno: ninguno de los dos lleva etiquetas de Helm, asi
   que no pisan ningun release.

### Verificacion

- Huerfanas: **1.583.765 -> 0** (y el barrido las mantiene a cero)
- Filas totales: 1.792.119 -> **210.085** · tamano **44 MB**
- **Intactas las que importan:** 29.889 vivas con producto y 5.453 con variante, **exactamente las
  mismas de antes**
- Duplicados por variante: **0** (el arreglo de claude de esta manana se sostiene)
- `api-ecom.vio.live/api/channels` **200** durante y despues

### Lo que NO arregla esto, y de quien es

El barrido es una red, **no la cura**: el codigo sigue insertando huerfanas. La cura es el camino
de insercion en `vio-products-microservice` (candidato claro: `replaceFeedImages`, que hace
`delete(owner)` + `save({...owner})`, y si el `owner` llega sin producto ni variante la fila nace
suelta). **Eso es de claude**, se lo pase por el handoff con todas las consultas.

**Cuando el codigo este arreglado, el candado definitivo es de base de datos:** un
`CHECK (product_id IS NOT NULL OR variant_id IS NOT NULL)` en `image`. MySQL 8.0.21 los aplica de
verdad. **No se puede poner antes**: hoy la insercion fallaria y romperia la sincronizacion de
Shopify de comercios reales, que es peor que filas basura.

- Pendiente: el arreglo del codigo (claude) y despues el CHECK. El barrido se puede retirar
  cuando el CHECK lleve unos dias sin rechazar nada.
