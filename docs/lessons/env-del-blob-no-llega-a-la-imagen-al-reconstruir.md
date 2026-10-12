---
title: El .env del blob se descarga bien, pero la imagen acaba sin las últimas líneas
last-updated: 2026-10-12
---

> **CORRECCIÓN (misma tarde).** La primera versión de esta lección decía que el build "no recoge el
> fichero del blob". **Eso es falso** y lo desmiente el log del propio build: el paso
> `RUN az storage blob download` **corre** (no está cacheado, 1,38 s) y descarga
> **`contentLength: 14269`**, que es exactamente la versión con el secreto añadido, con
> `lastModified` dos minutos anterior al build. Lo que queda sin explicar es por qué la imagen final
> tiene ese `.env` en **14.174 bytes**, es decir sin las dos líneas del final. Lo escrito abajo sobre
> *verificar* sigue valiendo; la causa raíz NO está identificada.

## El procedimiento documentado no funciona
`prod-power-on-demand.md` dice, para cargar un secreto: ponerlo en el `.env` del blob y
**reconstruir** el servicio, porque "el `.env` se hornea en la imagen, así que `kubectl set env` no
sirve". Lo segundo es cierto. **Lo primero no basta.**

El 12/10, cargando `PAYMENT_SECRETS_KEY` en producción:
- Clave escrita en `containerproductionsc/env-file-microservices/.env` (y también en
  `shopcart|api|payment-processors/.env`), verificada **leyendo el blob de vuelta**: presente,
  decodifica a 32 bytes.
- Blob modificado a las 14:15:51; build arrancado a las 14:16:09. El orden fue correcto.
- **Tres `gh run rerun` consecutivos** de los tres servicios, los tres `success`.
- En las tres imágenes resultantes, `/usr/src/app/.env` tiene **14.174 bytes, la versión original**,
  sin la clave. Se añadió además un `ENV_SOURCE_MARKER` distinto a cada fichero candidato para
  desempatar: **no aparece ninguno**.

Los pods corrían la imagen correcta (digest del contenedor igual al `:latest` del ACR, hora de push
posterior al cambio del blob). No es un problema de despliegue: es el **build** el que no trae el
fichero nuevo.

## Dónde mirar
`Dockerfile`, el bloque "Env File": `RUN az storage blob download --name "${ENV_FILE}" --file
"${ENV_FILE}" --auth-mode login`, seguido de `RUN sed -i "s|APP_NAME=...|APP_NAME=${APP_NAME}|g"`.
La instrucción no cambia entre builds, así que es candidata a reutilizarse de caché; y un
`blob download` que no sobreescriba un fichero ya presente también encajaría. **Causa exacta sin
confirmar** — lo confirmado es el efecto.

## Consecuencias que esto explica
Cualquier conclusión del tipo "cambié el secreto en el blob y reconstruí, luego ya está activo" es
**falsa** hasta comprobarlo dentro de la imagen. Repasar con esta luz todo lo que se dio por
aplicado por esa vía, incluida la clave de Datadog
(ver la nota de que Datadog no carga en ninguno de los 13).

## Cómo verificar de verdad que un secreto llegó
**No sirve `/proc/<pid>/environ`.** El `.env` lo carga `dotenv` dentro del proceso Node y puebla
`process.env` en memoria; el entorno de arranque del proceso no lo refleja. Prueba de que el método
engaña: `DB_HOST` tampoco aparece en `/proc/*/environ`, y el servicio obviamente la usa.

Lo que sí vale, en este orden:
1. `grep` del fichero **dentro del contenedor**: `kubectl exec ... -- grep ^CLAVE= /usr/src/app/.env`.
2. Confirmar que el pod es del build que crees: comparar el **digest del contenedor** con el del
   `:latest` del ACR y la **hora de push**.
3. Un marcador de usar y tirar en el fichero, para desempatar entre candidatos.

## Trampa que acompaña
`kubectl wait --for=condition=Available deploy/x` **vuelve de inmediato** si el deployment ya está
disponible con los pods viejos. Tras un build, no demuestra nada: esperar por el digest o por la
edad del pod. Por confiar en él inspeccioné un pod del build anterior y saqué una conclusión falsa.

## Estado real del diagnóstico (no cerrado)

**Confirmado:**
- El secreto se escribe en el blob y se relee de vuelta correctamente.
- El build descarga **ese** fichero: el log del paso lo dice (`contentLength`, `lastModified`).
- La imagen final tiene el mismo `.env` **menos las dos últimas líneas** (los ~96 bytes añadidos).
- El pod corre esa imagen (digest del contenedor igual al `:latest` del ACR).

**Descartado:**
- Caché de capas: el paso del download se ejecuta, con su salida y su tiempo en el log.
- Storage equivocado: solo `containerproductionsc` y `containerqasc` tienen el contenedor, y QA no
  tiene `.env` (usa `.env.local`). El tamaño descargado coincide con el de producción.
- El `sed` de `APP_NAME`: solo suma 1 byte.
- Que el `.env` venga del repo: no está en git (404 en la API de contenidos).

**Siguiente paso para cerrarlo**, acotado y sin tocar producción: un PR a `develop` de shopcart que
añada dos `RUN wc -c "${ENV_FILE}"` temporales, uno justo después del `sed` y otro después del
`yarn build`. El build de QA dirá en qué paso cambia el tamaño. Con eso se identifica el culpable en
una sola pasada.

**Mientras no esté cerrado:** no dar por activo ningún secreto nuevo del blob sin comprobarlo
**dentro del contenedor**, con el método de abajo.
