---
title: Cambiar el .env del blob y reconstruir NO aplica el cambio
last-updated: 2026-10-12
---

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
