---
title: "Un console.log esquiva la redacción del logger, y recrear pods no limpia Datadog"
date: 2026-10-24
---

## Síntoma

El micro `orders` tenía redacción de credenciales puesta (`omitPrivate`) y aun así el
`accessToken` y el `refreshToken` de Shopify del vendedor salían **en claro** en el log de
producción, en cada cancelación por supplier.

## Causa real

La línea no pasaba por el logger: era un `console.log('*******', ecomUser)` de depuración
(`order.service.ts:965`). La redacción vive en el logger del proyecto, así que **cualquier
`console.log`, `console.info` o `console.error` la salta entera**. Buscar «¿tenemos redacción?»
en la configuración del logger da un falso tranquilizador.

Segundo motor, independiente del código de la aplicación: el **log de consultas de TypeORM**
imprime `-- PARAMETERS: [...]`, así que un `UPDATE shopify_connection` publica el token aunque
ninguna línea de la aplicación lo imprima.

Y el nivel **no es configurable**: `level: 'debug'` está fijo en `package-logger/src/logger.ts`,
sin variable de entorno. No hay interruptor que bajar en el `.env`.

## Cómo se arregla / se evita

- Para auditar de verdad, **medir valores, no claves**: `grep -cE 'shpat_|shpca_|shprt_'` sobre
  el log. Contar apariciones de `accessToken:` da números enormes que incluyen las ya redactadas
  (`extensions` imprime `shpca_***(38`, que casa con el nombre de la clave y no es una fuga).
- `grep` con `--tail` y `grep` sobre el log completo dan cifras distintas: no compararlas entre sí
  y presentarlo como crecimiento.
- Purgar líneas ya escritas = **recrear el pod**, no editar nada. Hacerlo **de uno en uno**
  esperando `2/2 Running`, con `kubectl delete pod` y **no** `kubectl rollout restart`: el
  restart parchea la plantilla del Deployment y reclama campos que rompen el siguiente
  `helm upgrade` (ver [las réplicas no evitan el corte del deploy](./las-replicas-no-evitan-el-corte-del-deploy.md)).
- **Pero antes de prometer que se purgó, mirar si la aplicación envía los logs fuera.** Aquí no
  había DaemonSet de Datadog ni Container Insights —y con eso me quedé y dije que no había
  recolector— pero `package-logger` manda cada línea por HTTP a
  `http-intake.logs.datadoghq.eu` cuando existen `DATADOG_API_KEY` y `APP_NAME`. Recrear pods no
  toca eso. La comprobación son tres cosas, no una: el transporte en el código del logger, las
  dos variables en el pod, y el `Init transportDatadog` en el log de arranque.
- Con solo la API key **no se pueden consultar logs** en Datadog (hace falta una APP key). Y un
  200 del intake prueba que **acepta**, no que **indexe**: sin plan de Logs puede aceptarlo y
  descartarlo, y desde fuera no se distingue. Decirlo así, no «está en Datadog» a secas.
- Mientras la línea siga desplegada, purgar es una cinta de correr: cada operación la reescribe.
  Primero el merge, después la purga.
