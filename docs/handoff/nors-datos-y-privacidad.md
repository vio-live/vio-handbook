---
title: "Nørs (app de salud): qué datos recibe Vio y cómo se limita"
last-updated: 2026-10-13
owner: angelo
status: live
---

# Nørs — qué datos recibe Vio y cómo se limita

Nørs está lista para vender con Vio, pero su objeción es correcta: **no se
puede usar data de salud para recomendar productos**, y piden o bien no
mandar datos, o bien saber exactamente qué recibimos y si se puede anonimizar.

Esta página es la respuesta técnica, verificada contra el código el
2026-10-13. No es asesoría legal: para una app de salud hace falta además un
acuerdo de tratamiento de datos y definir quién es responsable y quién
encargado.

## Lo primero: Vio no personaliza por usuario

Qué componente y qué productos se muestran lo decide **la campaña que
configura el publisher**, como mucho filtrada por país
(`campaigns.target_countries`). No hay perfilado, ni recomendación por
historial, ni modelo que mire el comportamiento del usuario. La objeción
"usar datos de salud para recomendar" no aplica al diseño: no existe ese
camino.

## Analytics es opt-in

El SDK no mide nada hasta que la app llama explícitamente a
`Vio.analytics.start()`, y `collector: false` corta el envío. El commerce
(catálogo, carrito, checkout) funciona igual sin analytics.

## Qué se recibe cuando sí está encendido

| Grupo | Campos |
|---|---|
| Identificadores | `anon_id` (aleatorio, generado en el dispositivo), `session_id`, y `external_user_id` **solo si la app lo pasa** |
| Dónde pasó | surface (web/iOS/Android/TV), versión del SDK, campaña, componente, placement, sponsor |
| **Qué contenido** | `content_url`, `content_title`, `content_id` |
| Comercio | producto (id, nombre, marca, variante), cantidad, precio, moneda, orden, método de pago |
| Libre | `props` (lo que el host decida mandar) |

**No se recibe ni se guarda**: dirección IP (solo se usa en memoria para
limitar abusos), user agent, geolocalización, país, huella de dispositivo.
El contrato no tiene ningún campo de salud y no lo va a tener.

**Dónde vive**: ClickHouse propio en la UE (Oracle, Estocolmo), borrado
automático a los 2 años. Hay una copia hacia Mixpanel (host europeo), que se
puede apagar por cliente.

## El riesgo real, dicho claro

No son los identificadores: es **el contenido**. En una app de salud, el
título de la pantalla o el nombre del producto revelan la condición aunque el
dispositivo sea anónimo. Y conviene ser honestos: `anon_id` es
**seudonimización**, no anonimización — sigue siendo dato personal.

## Las tres opciones

1. **Sin datos.** No se llama a `start()` (o `collector: false`). No recibimos
   un solo evento. Se pierden los informes de rendimiento.
2. **Modo mínimo** — el recomendado. Se mide el funnel sin nada que diga qué
   miró el usuario.
3. **Modo mínimo + efímero.** Lo anterior y además sin identificador
   persistente: `requireConsent: true` mantiene los ids solo durante la visita
   y no escribe nada en el dispositivo.

### Qué es exactamente el modo mínimo

Dos capas, y la segunda no depende de que el cliente haga nada:

- **En el dispositivo** (`privateContent: true`, web-sdk#78): el SDK no envía
  `content_url`, `content_title`, `content_id`, ni nombre/marca de producto.
- **En el servidor** (`client_apps.privacy_mode = 'minimal'`, vio-backend#66 +
  vio-analytics#15): el colector **descarta esos campos al ingerir** y además
  `props`, y **no reenvía nada a Mixpanel**. Vale para cualquier versión del
  SDK, también para los eventos del espejo del backend.

**Lo que queda**: nombre del evento, surface, ids (anon, sesión, campaña,
componente, sponsor), `product_id`, cantidades, importes, moneda, número de
orden y método de pago. Alcanza para medir rendimiento y facturar comisiones.

**Lo que no queda**: ninguna pista de qué condición, contenido o producto —
en palabras — tocó el usuario, y ningún tercero ve esos eventos.

> Nota: `product_id` sobrevive porque sin él no se puede atribuir la venta ni
> liquidar comisión. Es un identificador del catálogo de Nørs; si aun así lo
> consideran revelador, la opción es la 1 (sin datos).

## Lo que podemos ajustar si lo piden

- **Retención más corta** que los 2 años actuales para su cuenta.
- **Borrado a pedido** de todo lo asociado a un identificador.
- **Sin Mixpanel** (ya implícito en el modo mínimo).

## Estado de implementación (2026-10-13)

| Pieza | PR | Estado |
|---|---|---|
| Columna `privacy_mode` + migración | [vio-backend#66](https://github.com/tipiodevelopment/vio-backend/pull/66) | abierto |
| Colector: descarta e ignora sinks | [vio-analytics#15](https://github.com/vio-live/vio-analytics/pull/15) | abierto |
| SDK: `privateContent` | [vio-web-sdk#78](https://github.com/vio-live/vio-web-sdk/pull/78) | abierto, falta publicar a npm |

Orden de merge: backend → colector → SDK. Hoy el modo se activa por SQL;
exponerlo en el dashboard de la surface queda pendiente. Si Nørs usa app
nativa, hay que replicar `privateContent` en Swift y Kotlin.
