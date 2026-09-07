---
date: 2026-09-08
session: "Vev — modelo de despliegue, limpieza de ramas y por qué no montamos staging"
participants: [angelo, claude]
status: live
---

# Vev: el modelo de despliegue, y 18 ramas menos

**Objetivo.** Angelo propuso montar ramas de entorno en el repo de Vev — `develop`→staging
y `main`→prod, como en el backend. Al mirarlo salió que el repo estaba peor preparado de
lo que parecía, y que la propuesta no se puede montar todavía por una razón concreta.

Detalle durable en [`architecture/vev.md`](../../architecture/vev.md); acá lo que se
decidió y por qué.

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

## Siguiente

- Si en algún momento se quiere staging de verdad: crear el paquete en Vev y decidir qué
  artículos lo usan. Recién ahí tiene sentido el trabajo de ramas y CI.
- ~~Automatizar el despliegue con `-t/--token` en Actions~~ — **descartado**: la cuenta de
  Vev no lo permite (Angelo, 2026-09-08). El CLI sí lo soporta, así que el bloqueo no está
  ahí; queda anotado para que nadie lo reinvestigue por ese lado. El despliegue de Vev
  seguirá siendo manual.
