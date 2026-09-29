# Scripts del corte a Sweden Central

Copia versionada de `~/vio-migracion/` (host de Angelo). El runbook es
[`../../migracion-region-sweden-central.md`](../../migracion-region-sweden-central.md);
esto es la parte ejecutable.

| archivo | qué hace | ¿corta? |
|---|---|---|
| `00-pre-ventana.sh` | TTL de DNS a 60 s, precarga de imágenes, baseline de webhooks Woo, lag de la réplica | no |
| `01-ventana.sh` | el corte, **paso a paso con confirmación en cada uno** | **sí** |
| `02-verificar.sh` | verificación; sale 1 si algo falla **o si algo no se pudo medir** | no |
| `99-rollback.sh` | vuelta a Noruega | sí |
| `selfcheck.js` | prueba activa de DB desde dentro de un pod | no |
| `patch-env.py` | genera los `.env` parcheados | no |
| `prepull-daemonset.yaml` | precarga las 13 imágenes en los nodos | no |
| `escalar-corte.sh` | escala los 13 a las réplicas de prod | no |

## Secretos
No hay ninguno en estos archivos. `patch-env.py` los lee de variables de entorno
(`DB_PASS`, `CACHE_PASS`, `SC_STORAGE_KEY`, `SB_TEST_KEY`) y los scripts de `CF_DNS_TOKEN`.
La contraseña nueva de la DB la genera `01-ventana.sh` y la deja en
`~/vio-migracion/rollback/db-sc-password.txt` con permisos 600. **No commitear ese archivo.**

## Por qué `02-verificar.sh` es como es
Se reescribió tres veces, cada vez porque un ensayo encontró que daba un resultado falso:

1. **Daba "OK" sin haber medido nada.** Un 502 transitorio del kubelet dejó vacía la IP de la
   DB; todas las comparaciones dieron cero y el script cerró en verde. Ahora: si no puede
   medir, **falla**. Resolver la IP se hace localmente y con reintentos, no desde un pod.
2. **Un pod en Terminating contaba como sano.** Ahora se filtran los pods con
   `deletionTimestamp` y se compara réplicas deseadas contra listas.
3. **Espiar `/proc/net/tcp` da falsos negativos.** El pool de TypeORM cierra conexiones por
   idle: un pod de 350 s ya aparecía sin socket. La verificación de verdad es la **prueba
   activa** (`selfcheck.js`): cada pod lee su propio `.env` montado, se conecta a la DB que
   ese archivo dice y reporta `@@hostname`, `@@read_only` y un `COUNT(*)` real. No depende
   de tráfico, ni de rutas HTTP, ni de la edad del pod.

El chequeo de sockets quedó **sólo** para lo que sí es time-independent y es el síntoma del
corte fallido del 29/09: **cero sockets a `10.224.0.4`** (el private endpoint de Noruega).

`ENSAYO=1 ./02-verificar.sh` acepta `read_only=1` (réplica sin promover). Sin esa variable,
una DB en read-only es un fallo: significa que falta el paso 4 de la ventana.
