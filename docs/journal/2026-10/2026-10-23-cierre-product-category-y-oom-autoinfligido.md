## Cierre de `product_category`, limpieza del rastro y un OOM que me hice yo — Miguel

- **Quién:** Miguel. El código de P1-P3 lo hizo `claude`; yo verifiqué, limpié y corregí estado.
- **Dónde:** `vio-live/package-database`, `vio-api-microservice`, `vio-products-microservice`,
  pod `api-b85f6b78f-cglzn` de producción. Handbook.
- **Cuándo:** 23/10 por la noche, cerrando el día del incidente de heap.
- **Contexto:** mi reparto del plan (P1+P2 a jhondev, P3 a juan) quedó obsoleto en dos horas: Angelo
  lo pasó a `claude` («como veníamos trabajando») y el trabajo se mergeó mientras `vio` seguía
  preparando tarjetas de Trello para él.
- **Hecho:**
  - **Verificado contra GitHub, PR por PR**, no contra lo que se cuentan las sesiones: P1 #31/#32,
    P2 #28, P3 #61/#62, todos mergeados entre 19:01Z y 19:29Z. P2 además **ya corrió en producción**
    (19:27Z, 263.241 filas borradas en 53 lotes, tabla a 5.871 filas y 0 duplicados).
  - **Cerrados #26 y #27 de `package-database`** por superados por el #28, con el motivo en el PR.
    El índice que entró no es el `UNIQUE` plano que yo había escrito: es columna generada `live` +
    `UNIQUE (product_id, category_id, live)`, que exime las filas con borrado lógico. Mi aviso de que
    el plano rompería el re-enlazar era cierto contra el #26, que no es lo que se mergeó.
  - **Parado a `vio`** antes de que creara tres tarjetas de trabajo ya hecho y con el diseño viejo.
  - **Contestada la pregunta del canal de coordinación con evidencia**: el OOM de las 18:26:54Z lo
    provoqué yo. `exec` de un `node` con TypeORM a las 18:26:47Z en el mismo pod que 28 s antes había
    servido la petición del 482 y estaba en 366 MB de 768Mi. Siete segundos entre el `exec` y la
    muerte del contenedor.
- **Pendiente:**
  - `vio-api-microservice` **#63**, abierto y mergeable, **para revisar el lunes** (sin `page`/`size`
    no hidrata y `totalItems` sale de un COUNT; ningún caller real llama así).
  - Puntos calientes apuntados, no urgentes: `POST /channel/multi-group/v2` hidrata el catálogo por
    cada chunk de 20, y queda el cartesiano de variantes × imágenes × envíos.
  - La orden de prueba de Careless, que es lo único que ejercita webhook, analytics y la captura en
    la unidad 1179558. Depende de Angelo.
- **Dos errores míos de la noche, los dos de dar estado sin mirar la fuente:** el reparto (dos
  versiones distintas en una hora) y decir que la migración estaba pendiente cuando ya había corrido
  en prod. Lecciones en
  [`../../lessons/mandar-trabajo-a-otro-agente.md`](../../lessons/mandar-trabajo-a-otro-agente.md) y
  [`../../lessons/medir-dentro-del-pod-que-sirve.md`](../../lessons/medir-dentro-del-pod-que-sirve.md).

### Adenda (21:30 UTC) — verificación en producción y crédito corregido

- **Medido en la base de producción** (lectura directa desde un pod de `users`, script borrado al
  terminar): `product_category` en **5.871 filas / 5.871 vivas / 5.871 pares distintos / 0
  duplicados**, índice `UQ_product_category_live` sobre `(product_id, category_id, live)`,
  **0 filas nuevas desde la migración** (antes ~10.000/día) y ningún `ER_DUP_ENTRY` en el log de
  `products`. No sólo quedó limpia: aguanta.
  - Falso positivo que estuve a punto de reportar: el `AUTO_INCREMENT` (271.131) va por delante del
    `max(id)` vivo (269.754). **No son inserciones rechazadas** — borrar filas no baja el contador.
    Lo descarté comprobando que sólo 3 filas tienen `id > 269.112` y que no hay errores de clave
    duplicada en el log.
- **Crédito corregido, y el error era mío:** escribí que a `jhondev` y `juan` los había desconvocado
  «antes de que abrieran nada», y se lo repetí a Angelo. Falso. Mi desconvoque fue a las 18:41Z;
  products#31 se abrió a las **18:45:11Z** (jhondev lo confirma, es suyo) y api#61 a las **18:46:17Z**.
  El PR que está en producción es el de jhondev, no uno escrito después. Pedida a `juan`
  confirmación de #61 en vez de atribuirlo por suposición: todos los PRs salen de la cuenta
  compartida `angelosv`, así que **git no dice quién es el autor real**.
- **Matiz sobre la verificación de P1:** jhondev ejecutó a mano el mismo SQL del helper contra datos
  reales de QA. Eso confirma la lógica, **no el camino de escritura del servicio desplegado** — la
  misma trampa de `feedback_simular_un_helper_no_prueba_el_camino_de_escritura`. El criterio del plan
  (importar dos veces contra el servicio y contar) **sigue sin cumplirse**; va al lunes con QA
  encendido, no a prod.
- Antes del merge se añadió a #31 el commit `3f8396e`: `ER_DUP_ENTRY` (1062) se trata como «ya
  existe» y no como error, para la carrera de dos importaciones simultáneas del mismo par. Sólo se
  traga el 1062; el resto se relanza. Cambia el contrato del helper y está avisado a su autor.
