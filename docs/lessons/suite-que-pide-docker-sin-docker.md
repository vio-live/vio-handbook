---
title: "Una suite que pide Docker se puede correr sin Docker: pod efímero + port-forward"
last-updated: 2026-10-14
---

# Síntoma

`yarn test:mysql` (o cualquier suite que levante su base en Docker) no corre: en la laptop no hay
Docker instalado — ni Colima ni Podman, no es que esté apagado. Tentación: entregar el trabajo
diciendo "ese paso no lo pude verificar".

# Causa real

El script de la suite **no necesita Docker**, necesita *una base con una configuración concreta*.
En `vio-campaigns-microservice`, `scripts/test-mysql.sh` solo usa Docker para fabricar un
`mysql:8.0.21` con `--default-authentication-plugin=mysql_native_password` y `latin1`, y le pasa la
URL a jest por `TEST_MYSQL_URL`. Esa variable es el único enganche.

# Cómo se arregla

Levantar la base en un pod efímero del cluster de QA y hacerle `port-forward`:

```bash
kubectl --context kubernetesqa-sc run ...   # mysql:8.0.21, mismos flags, anotación:
#   sidecar.istio.io/inject: "false"        # sin esto, el sidecar interfiere
kubectl --context kubernetesqa-sc port-forward pod/<pod> 13306:3306 &

TZ=UTC TEST_DB=mysql TEST_MYSQL_URL="mysql://root:test@127.0.0.1:13306/<db>" \
  npx jest --config test/jest.mysql.config.js --runInBand --testTimeout=180000
```

Dos cosas que no son opcionales:

- **`--testTimeout` alto.** Por el túnel a Suecia cada query paga la latencia, y un `beforeEach`
  que arma la app y siembra datos no entra en los 5 s por defecto de jest. Primer intento: **67 de
  79 rojos, todos "Exceeded timeout of 5000 ms for a hook"**. No era el código. Con 180 s,
  **79/79**. Si una suite se cae en masa y *toda* la salida dice *timeout for a hook*, mirar la
  latencia antes que el código.
- **Base propia y borrarla.** Esquema aparte (`campaigns_test`), nunca una base real, y `delete
  pod` al terminar. El pod es más barato que la base: ~1 min de arranque y 0 riesgo sobre QA.

Una base de 8.0.21 en un nodo amd64 del cluster se parece **más** a producción que la misma imagen
emulada en un Mac ARM.

# Relacionado

- `docs/journal/2026-10/2026-10-14.md` — TypeORM del micro de campañas (PR #7).
- Un pod efímero con sidecar de Istio da `connection refused` contra un destino sano: por eso va
  `sidecar.istio.io/inject: "false"`.
