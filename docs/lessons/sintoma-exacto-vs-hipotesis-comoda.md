# El síntoma exacto vale más que la hipótesis cómoda

**2026-08-31**, persiguiendo un 503 al agregar productos a un canal
([handoff](../handoff/2026-08-31-503-canales-crash.md)).

## Qué pasó

Medí que el endpoint de alta inserta en serie (~139 ms por producto) y concluí
que el 503 era un **timeout** con selecciones grandes. La medición era correcta
y la conclusión encajaba: expliqué el error, propuse una mitigación (trocear el
alta) y la implementé.

Era falsa. Dos datos la contradecían y no los miré:

- El 503 aparecía también en `/channel/user` y `/request/user/:id`, que son GET
  baratos y no tienen nada que ver con el alta. Un timeout del alta no los toca.
- `main.ts` del microservicio pone `res.setTimeout(10 * 60 * 1000)`. Diez
  minutos. Ninguna selección real llegaba ahí.

Lo que la tiró abajo fue una frase del usuario: *"va como agregando de a uno los
productos y los otros fallan"*. Un timeout no produce eso. Un proceso que muere
justo después de guardar el primer elemento, sí — y de ahí salió la causa real.

## La lección

Una hipótesis que explica *el error* no es lo mismo que una que explica **el
síntoma exacto, con todos sus detalles raros**. Los detalles que no encajan no
son ruido: son justamente donde está la causa. Antes de dar una explicación por
buena, revisar qué observaciones deja sin explicar — y decirlo en voz alta.

Corolario práctico: cuando el usuario describe la forma del fallo con sus
palabras ("de a uno", "el primero sí", "solo a veces"), eso es evidencia de
primera mano sobre el mecanismo. Vale más que cualquier medición propia sobre un
entorno que no es el suyo.
