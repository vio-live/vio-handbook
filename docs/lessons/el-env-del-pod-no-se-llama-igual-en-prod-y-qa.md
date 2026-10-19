---
title: "El `.env` del pod no se llama igual en prod y en QA"
date: 2026-10-19
author: miguel
tags: [kubernetes, migraciones, qa, prod, dotenv]
---

## Síntoma

Un script de migración/consulta que corre bien en el pod de `users` de **prod** falla en **QA** con
un error vacío y nada más:

```
ERR
command terminated with exit code 1
```

Sin mensaje, sin stack. Parece credenciales malas o la base caída.

## Causa real

El fichero de entorno **se llama distinto en cada entorno**:

| Entorno | Ruta en el pod |
|---|---|
| prod (`vio-commerce-prod-sc`) | `/usr/src/app/.env` |
| QA (`kubernetesqa-sc`) | `/usr/src/app/.env.local` (+ `.env.test`) |

`require('dotenv').config({ path: '/usr/src/app/.env' })` **no lanza** si el fichero no existe: se
queda callado y deja `process.env` sin las vars. Después `mysql.createConnection({host: undefined})`
revienta con un `err.message` vacío, que es de donde sale el `ERR` pelado.

Esto importa porque los runbooks de migraciones se escriben primero para QA y luego se reusan en
prod (o al revés, como el 19/10 con `surface_campaign_slot.source`): la ruta copiada no aplica.

## Cómo se arregla

Parametrizar la ruta en vez de empotrarla, y comprobar cuál existe antes:

```bash
kubectl --context $CTX exec -n default $P -c users -- ls -la /usr/src/app/ | grep -i '\.env'
```

```js
require('dotenv').config({ path: process.env.ENVF || '/usr/src/app/.env' });
```

```bash
kubectl --context $CTX exec -n default $P -c users -- env ENVF=/usr/src/app/.env.local node /tmp/script.js
```

## Cómo evitar el diagnóstico a ciegas

El script debe **imprimir a qué base se conectó antes de hacer nada**, no solo el resultado:

```js
const [[{ db }]] = await c.query('SELECT DATABASE() db');
console.log('base:', db, '| DB_HOST env:', e.DB_HOST || e.TYPEORM_HOST);
```

Y en el `catch`, no tirar el error cuando el mensaje viene vacío:

```js
.catch(err => { console.log('ERR', err.code || '', String(err.message || err).split('\n')[0]); process.exit(1); });
```

Con `err.code` el fallo se habría leído de una como `ERR_INVALID_ARG_TYPE` / host `undefined`, no
como un misterio.
