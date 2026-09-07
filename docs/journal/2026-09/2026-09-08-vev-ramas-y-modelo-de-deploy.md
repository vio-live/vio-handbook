---
date: 2026-09-08
session: "Entornos: qué hay realmente en Commerce y en Vev, y limpieza de ramas"
participants: [angelo, claude]
status: live
---

# Entornos: lo que hay de verdad, en Commerce y en Vev

Angelo preguntó si lo de Qliro estaba en staging. Tirando de ese hilo salió que **el
modelo de entornos que creíamos tener no es el que tenemos**, ni en el backend ni en Vev.

**Objetivo.** Angelo propuso montar ramas de entorno en el repo de Vev — `develop`→staging
y `main`→prod, como en el backend. Al mirarlo salió que el repo estaba peor preparado de
lo que parecía, y que la propuesta no se puede montar todavía por una razón concreta.

Detalle durable en [`architecture/vev.md`](../../architecture/vev.md); acá lo que se
decidió y por qué.

## Parte 1 — Commerce: hay dos entornos, no tres

El `deploy.yml` de cada servicio tiene cableado `develop`→QA, `pre-develop`→STAGING,
`main`→PROD, con su juego completo de secretos `*_STAGING`. Pero:

- La rama **`pre-develop` existe en 1 de 8 repos** (products), abandonada el 2026-08-20 y
  34 commits por detrás de develop.
- **La infraestructura de staging no existe.** En Azure sólo hay dos AKS
  (`vio-commerce-prod`, `kubernetesqa`) y dos ACR relevantes (`reachuprod2`, `reachuqa2`).

O sea que el staging que Angelo proponía montar **ya es lo que hay**, con otro nombre:
`kubernetesqa` es el entorno compartido, y se llama QA por herencia. El propio host
`graph-ql-staging.vio.live` ya dice staging.

Queda un camino armado sin dueño: si alguien crea una rama `pre-develop` en cualquier
repo, el pipeline dispara y despliega con esos secretos. Conviene borrarlo de los
workflows. **No se hizo** — son 7 repos de CI y quedó pendiente de decisión.

### La trampa del chart

Mirando el diff `develop..main` de shopcart antes de un posible release apareció algo peor:
`charts/<svc>/values.yaml` lleva el registry, **difiere por rama a propósito**
(`reachuprod2` en main, `reachuqa2` en develop), y el deploy es `helm upgrade` **sin
`--set image.repository`**. Cada merge a producción depende de que alguien resuelva bien
ese archivo; si gana la versión de develop, prod tira imágenes del registry de QA. Y no
falla ruidosamente.

Lección: [`config-de-entorno-en-archivo-versionado.md`](../../lessons/config-de-entorno-en-archivo-versionado.md).
Arreglo propuesto (una línea, el dato ya está en el workflow): pasar
`--set image.repository=$ACR/<svc>`. **No hecho** — cambia comportamiento de deploy y
merece verificarse en un servicio antes de replicarlo.

### Estado de cara a un release

Qliro entero está en `develop`→QA; **producción intacta**. Si se promoviera, en shopcart
entrarían 47 commits (4.172 líneas de código real; el resto del diff es el lockfile) y no
sólo Qliro:

- **Walley completo**, mergeado el 2026-08-31 y **nunca probado end-to-end**.
- El **cifrado de secretos de pago**, desplegado pero dormido: cargar
  `PAYMENT_SECRETS_KEY` en prod sin haber cifrado antes las credenciales existentes las
  dejaría sin descifrar. El orden importa.
- Las **credenciales de producción de Qliro**: hoy el fallback de plataforma tiene las de
  sandbox.

## Parte 2 — Vev: peor preparado todavía

## Lo que se encontró

- **Sólo `main`, y cero CI.** No hay `.github/workflows/`. Cada despliegue es
  `npm run deploy` a mano desde un portátil, y llega al **paquete compartido** en cuanto
  termina. Vev es la única pieza de Vio Commerce sin entornos.
- **Siete instantáneas fechadas de main** (`main-28-jul` … `main-18-ago`, más
  `backup/v0.127-2026-08-11`). Eso es marcha atrás hecha a mano.
- **Pero marcha atrás nativa sí hay:** `vev versions` + `vev restore`. El paquete lleva
  **285 versiones** desplegadas. Las instantáneas estaban reimplementando a mano algo que
  el CLI ya hacía.
- **La mitad del historial dice `No deploy message`** — incluidos los tres despliegues del
  2026-09-07. Una versión sin mensaje es una versión a la que nadie vuelve, así que el
  `restore` está ahí sin poder usarse.

## Decisión: no montar staging todavía

Dos razones, y la segunda es la que pesa:

1. **No existe un paquete de staging.** Sólo el compartido `cq1lXld-TA9` y el sandbox
   personal `cF67JS--lMi`. Crear uno arrastra decidir qué artículos apuntan a él — es
   contenido, no código.
2. **`vev deploy` no acepta el paquete por parámetro**: sale de `vev.json`. "Una rama, un
   paquete" significaría un `vev.json` por rama, o sea configuración de entorno en un
   archivo versionado. Es la misma trampa que `charts/*/values.yaml` en los microservicios
   —encontrada el día anterior mirando el diff `develop..main` de shopcart— pero peor: un
   merge equivocado no rompe el despliegue, **lo manda al paquete que no era en silencio**.

Si se monta algún día, la forma limpia es sacar la clave de `vev.json` y que el workflow la
escriba según la rama desde un secreto. `vev deploy` acepta `-t/--token`, así que
automatizarlo es viable.

## Hecho

**18 ramas borradas.** Antes se verificó una por una que el **contenido** estuviera en
`main`, no el commit: tres se habían integrado con *squash*, así que su commit no aparece
en el historial pero su trabajo sí (PRs #7, #4, #5). Otras cinco sólo diferían en
`vio-sdk/index.js`, que es regenerable.

SHAs por si alguna vez hace falta resucitar una — `git push origin <sha>:refs/heads/<rama>`:

```
alan-reachu-demo                       d650302
backup/v0.127-2026-08-11               f720e3b
chore/rebundle-0.5.1                   10ce514
chore/rebundle-sdk-0.5.0               48bf92d
chore/rebundle-sdk-0.9.0               1811c70
chore/rebundle-sdk-0.9.1               3937183
chore/rebundle-theme-overrides         3c8901c
docs/readme                            3da4dd1
feat/analytics-send-to-vio             1d94206
feat/personal-sandbox-package          10cb92b
feat/theme-panel-fields                40ccf54
fix/vipps-return-hardening-rebundle    6087765
main-11-ago                            a496c98
main-17-ago                            82bcb86
main-18-ago                            e9086d0
main-28-jul                            8873120
main-29-jul                            407b8c7
main-30-jul                            35d2c1f
```

En GitHub queda sólo `main`.

## Convención nueva

**Desplegar Vev siempre con mensaje:** `vev deploy -m "qué entra"`. Es lo que vuelve
utilizable el `restore`, y es gratis.

## Ámbito, para el que lea esto después

A mitad de sesión Angelo acotó el ámbito a **Vev**. Lo de la Parte 1 (Commerce) queda
documentado porque el hallazgo importa y le sirve a quien lo tome, pero **no es trabajo de
esta sesión ni de este agente**: nada de eso se ejecutó.

## Siguiente

- **Commerce — otro agente.** Borrar el camino `pre-develop` de los 7 `deploy.yml` y sacar
  el registry del chart con `--set image.repository=$ACR/<svc>`. Ninguna se hizo; la
  segunda cambia comportamiento de deploy y conviene verificarla en un servicio antes de
  replicarla.
- **Vev:** si en algún momento se quiere staging de verdad, crear el paquete y decidir qué
  artículos lo usan. Recién ahí tiene sentido el trabajo de ramas.
- ~~Automatizar el despliegue con `-t/--token` en Actions~~ — **descartado**: la cuenta de
  Vev no lo permite (Angelo, 2026-09-08). El CLI sí lo soporta, así que el bloqueo no está
  ahí; queda anotado para que nadie lo reinvestigue por ese lado. El despliegue de Vev
  seguirá siendo manual.
