---
title: "Vev — los bloques, el paquete y cómo se despliega"
last-updated: 2026-09-08
owner: angelo
status: live
---

# Vev (`vio-live/vev`)

> Cómo se construye y se publica lo que los editores ven en Vev. El SDK en sí está en
> [`web-sdk.md`](./web-sdk.md); esto es el otro lado: el repo de bloques, el paquete y
> el modelo de despliegue.

## TL;DR

- Los bloques importan el núcleo de Vio desde `vio-sdk/index.js`, un **snapshot
  vendorizado con esbuild desde el código fuente** de `vio-web-sdk` — **no** desde npm.
  Publicar en npm y rebundlear Vev son dos cosas independientes.
- **Un solo paquete compartido**, `cq1lXld-TA9`. No hay entornos.
- **No hay CI.** Cada despliegue es `npm run deploy` a mano desde un portátil, y llega a
  los editores en cuanto termina.
- La marcha atrás existe y es del CLI: `vev versions` + `vev restore`.

## El repo y el paquete

| | |
|---|---|
| Repo | `vio-live/vev` (clon local: `~/Documents/GitHub/vio-vev`) |
| Paquete compartido | `cq1lXld-TA9` (`vev.json`, `shareWithAccount: true`) |
| Sandbox personal | `cF67JS--lMi` (`vev.angelo.json`, **no** compartido) |
| Componentes | 9 en `src/components/` — carousel, grid, card, product, config, picker, inspector de analytics, acción de abrir producto |

El sandbox existe para probar algo arriesgado sin tocar el compartido. Se cambia con
`npm run sandbox:on` y **se vuelve con `npm run sandbox:off`** — el script avisa, porque
`vev.json` es un archivo versionado y dejarlo apuntando al sandbox rompería el siguiente
despliegue real.

## Rebundlear el SDK

El comando canónico está en el README del repo:

```bash
cd ../vio-web-sdk && npx tsc --noEmit
npx esbuild src/_vev-entry.ts --bundle --format=esm --external:react --external:react-dom \
  --tsconfig=tsconfig.json --outfile=../vio-vev/vio-sdk/index.js
```

Después `npx vev build` (sanity) y `npm run deploy`.

**Verificar el bundle antes de desplegar**, con un `grep` de los símbolos nuevos sobre
`vio-sdk/index.js`. Es la única comprobación barata de que el bundle trae lo que uno cree
que trae: el esbuild no falla si el entrypoint no exporta lo esperado.

## Despliegue: lo que hay que saber

**Vev es la única pieza de Vio Commerce sin entornos.** El backend tiene `develop`→QA y
`main`→prod; acá hay un paquete y ya. Un `vev deploy` **es** producción para cualquier
editor que use el paquete.

Eso no lo vuelve frágil por sí solo, pero cambia el tipo de cuidado: no hay un escalón
donde equivocarse gratis. Las dos redes que sí existen son el sandbox personal y el
`restore`.

### ⚠️ Un `vev deploy` NO alcanza a una página ya publicada

Descubierto el 2026-09-08 después de perder media hora midiendo el bundle equivocado. El
despliegue actualiza el paquete **en el editor**, pero una página ya publicada **queda
clavada al bundle con el que se publicó**. Hay que **republicarla** para que coja el nuevo.

Se comprueba por el hash del fichero servido:

```js
const u=[...document.querySelectorAll('script[src]')].map(s=>s.src).find(s=>/pkg\/v1\//.test(s));
fetch(u).then(r=>r.text()).then(t=>console.log({bundle:u.split('/').pop(), tiene:t.includes('<algo del cambio>')}));
```

Si el hash no cambia tras un deploy, la página no se republicó. Esto es la mitad de por qué
el ciclo de prueba es caro — ver
[`lessons/reproducir-antes-de-desplegar-una-hipotesis.md`](../lessons/reproducir-antes-de-desplegar-una-hipotesis.md).

### Marcha atrás

```bash
vev versions          # lista las versiones desplegadas, con su mensaje
vev restore           # vuelve a una anterior
```

Al 2026-09-08 el paquete lleva **285 versiones**. Por eso:

> **Desplegar siempre con mensaje:** `vev deploy -m "qué entra"`. Una versión que dice
> `No deploy message` es una versión a la que nadie se va a atrever a volver. La mitad
> del historial está así, y es el único motivo por el que `restore` no se usa.

### Automatizarlo: descartado por la cuenta

`vev deploy` acepta `-t/--token`, así que **por el lado del CLI se podría** desplegar
desde un workflow sin depender de un portátil. No se va a hacer: **la cuenta de Vev no lo
permite** (Angelo, 2026-09-08).

Queda escrito para que nadie vuelva a investigarlo por el lado del CLI: el bloqueo no está
ahí. El despliegue de Vev seguirá siendo manual mientras la cuenta sea la que es.

## Por qué no hay `develop` → staging

Se evaluó el 2026-09-08 y **se decidió no montarlo**, por dos razones:

1. **No existe un paquete de staging.** Sólo están el compartido y el sandbox personal.
   Crear uno es una decisión de contenido, no de código: un paquete de staging sólo sirve
   si hay artículos apuntando a él.
2. **`vev deploy` no acepta el paquete por parámetro** — sale de `vev.json`. Así que "una
   rama, un paquete" significaría un `vev.json` distinto por rama: configuración de
   entorno viviendo en un archivo versionado, que se resuelve mal en cada merge. Es la
   misma trampa que `charts/*/values.yaml` en los microservicios, y acá sería peor: un
   merge equivocado no rompe el despliegue, lo manda al paquete que no era **en silencio**.

Si algún día se monta, la forma limpia sería sacar la clave de `vev.json` y que el
despliegue la resuelva por rama, no que viva en un archivo versionado. Nótese que eso
suponía un workflow, y los workflows están descartados por la cuenta (ver arriba): un
staging real hoy implicaría también hacer el cambio de paquete a mano.

## Ramas

**Sólo `main`.** El 2026-09-08 se borraron 18 ramas muertas: siete instantáneas fechadas
de main (`main-28-jul`, `main-29-jul`, `main-30-jul`, `main-11-ago`, `main-17-ago`,
`main-18-ago`, `backup/v0.127-2026-08-11`) y once de feature ya integradas.

Las instantáneas eran marcha atrás hecha a mano, de cuando no se sabía que `vev restore`
existía. Con `restore` disponible no aportaban nada y ensuciaban la búsqueda.

Antes de borrarlas se verificó una por una que su **contenido** estuviera en `main` — no
su commit: tres de ellas (`feat/analytics-send-to-vio`, `feat/personal-sandbox-package`,
`feat/theme-panel-fields`) se habían integrado con *squash*, así que su commit no aparece
en el historial pero su trabajo sí (PRs #7, #4 y #5). Los SHA quedaron registrados en el
journal del día por si alguna vez hiciera falta resucitar una:
`git push origin <sha>:refs/heads/<rama>`.

## Enlaces

- SDK: [`web-sdk.md`](./web-sdk.md)
- Estado de pagos: [`payments.md`](./payments.md)
- Journal del 2026-09-08: [`../journal/2026-09/2026-09-08-vev-ramas-y-modelo-de-deploy.md`](../journal/2026-09/2026-09-08-vev-ramas-y-modelo-de-deploy.md)
