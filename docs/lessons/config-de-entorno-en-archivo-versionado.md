---
title: "Configuración de entorno en un archivo versionado: el merge decide dónde despliegas"
last-updated: 2026-09-08
owner: angelo
---

# Config de entorno en un archivo versionado

Encontrado el 2026-09-07 mirando el diff `develop..main` de shopcart, antes de un release.
Aparece en dos sitios distintos de Vio, así que no es una anécdota de un repo.

## El patrón

Un archivo **versionado** guarda a qué entorno apunta el despliegue, y cada rama lleva un
valor distinto:

| Sistema | Archivo | `develop` | `main` |
|---|---|---|---|
| Microservicios de Commerce | `charts/<svc>/values.yaml` | `reachuqa2.azurecr.io/<svc>` | `reachuprod2.azurecr.io/<svc>` |
| Vev | `vev.json` (si se montaran ramas) | paquete de staging | paquete compartido |

Mientras nadie mezcle las ramas funciona. El problema es que **el merge es quien decide**:
`develop`→`main` propone sobrescribir ese archivo con el valor de develop, y sólo la
resolución manual —repetida, sin red— impide que producción quede apuntando a QA.

## Por qué es peor de lo que parece

**No falla ruidosamente.** El despliegue no revienta: se ejecuta contra el sitio
equivocado. En el caso del chart, producción intentaría tirar imágenes de un registry de
QA; en el de Vev, un `deploy` iría al paquete que no era y los editores lo verían sin que
nada avise.

**Se agrava con binarios.** El chart viaja además como `charts/<svc>-0.1.0.tgz`, que git
no puede fusionar. Un conflicto ahí se resuelve eligiendo un lado a ciegas.

**No deja rastro.** Nadie escribe "resolví values.yaml a favor de prod" en el mensaje del
merge, así que la próxima persona no sabe que ese archivo necesita cuidado.

## La regla

**La configuración de entorno no se versiona: se inyecta en el momento del despliegue.**

Para los charts, el arreglo es de una línea y el dato ya está disponible — el workflow
tiene el ACR en una variable de entorno:

```bash
helm upgrade --install <app> ./charts/<app>-0.1.0.tgz \
  --set image.repository=$ACR/<app>
```

Con eso el chart queda idéntico en las dos ramas y el merge deja de poder equivocarse.

Para cualquier archivo que una herramienta exija tener en disco (`vev.json` y su clave de
paquete, por ejemplo), la forma es no versionar el valor y que el despliegue lo escriba
desde un secreto.

## Cómo detectarlo en otro repo

Comparar los dos lados antes de un release, no después:

```bash
git diff origin/develop...origin/main -- . ':!package-lock.json' ':!yarn.lock'
```

Si ahí aparece un archivo de configuración —y no sólo código—, ese archivo es el que va a
decidir dónde despliegas.

## Enlaces

- [`architecture/vio-commerce.md` §5](../architecture/vio-commerce.md) — el modelo de
  ramas y entornos de Commerce.
- [`architecture/vev.md`](../architecture/vev.md) — por qué no se montaron ramas de
  entorno en Vev, con esta trampa como una de las dos razones.
