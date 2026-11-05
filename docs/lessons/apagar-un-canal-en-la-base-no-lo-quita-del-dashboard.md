---
title: "Apagar un canal en la base no lo quita del dashboard"
date: 2026-11-05
author: miguel
status: live
---

## Síntoma

Pones `channel.enabled = 0` en la base para retirar un canal, lo verificas en la tabla, y el
vendedor **lo sigue viendo** en el dashboard como canal conectable. Si le da a conectar, se crea
un canal que puede no tener ya código detrás.

## Causa

`webapp-vio-commerce` **no construye el catálogo desde la API**. `PROVIDER_GROUPS`, en
`src/lib/channels.js`, es una lista escrita a mano con los ids, y **nunca se cruza con el `enabled`
que devuelve `GET /channels`**. El comentario del fichero dice «ids reales de GET /channels», lo que
hace fácil suponer lo contrario: son los ids reales, sí, pero copiados, no leídos.

O sea: el `enabled` de la base gobierna el backend; el front tiene su propia copia.

## Qué hay que tocar para retirar un canal de verdad

1. `channel.enabled = 0` en la base **de cada entorno** (comprobando antes `channel_user` a 0).
2. La entrada del id en `PROVIDER_GROUPS` de `src/lib/channels.js`.
3. El código del canal en los micros que lo tratan de forma especial.

Y al revés: si alguien añade un canal nuevo a la tabla y no aparece en el dashboard, no es la API,
es que falta en esa lista.

## Detalle al retirar

El icono de `src/views/channels/icons.jsx` **se queda** aunque el canal salga del catálogo: las
filas antiguas de ese canal siguen pintándose en la lista de canales del vendedor, y sin icono caen
al avatar de letra. Son mapas distintos con propósitos distintos: uno es «qué puedes conectar», el
otro «cómo pinto lo que ya existe».

## Cómo se encontró

Barriendo con `gh search code` por toda la organización **después** de dar por cerrada la purga del
canal WordPress en los tres micros. No salió en el inventario inicial porque buscaba consumidores
de rutas y de la constante del canal, no la palabra en el front.

**El inventario de un purgado se repite al final, no solo al principio.**
