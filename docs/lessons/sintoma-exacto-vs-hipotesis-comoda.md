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

## Segundo caso: el canal "sin asignar" de Bohus (2026-09-01)

Mismo modo de fallo, otro dominio
([journal](../journal/2026-09/2026-09-01-bohus-demo-y-theming.md)). Commerce
devolvía `"The user does not have an assigned channel"` al pedir productos del
canal de Bohus. Teoricé **dos veces** y las dos mandé a Angelo para el lado
equivocado:

1. "El canal no está asignado en Commerce" — leyendo el mensaje de error
   literalmente. Falso: `GetChannels` con esa misma key devolvía el canal.
2. "Esa key es de cuenta; falta la del canal" — inventando una taxonomía de keys
   a partir del comportamiento. Falso: el placeholder del propio dashboard tiene
   el mismo formato, y la comparación de abajo lo desmintió.

Lo que lo resolvió no fue otra teoría, sino un **control**: correr la misma query,
contra el mismo endpoint, con una key que **sí funcionaba** (la del `.env` local,
canal 474 "Aller"). Formato idéntico, ambas listaban su canal, misma clase de key
— con lo cual la diferencia sólo podía estar en la configuración del canal.

### La lección adicional

Cuando algo falla y **existe un caso equivalente que funciona**, compararlos es
más barato y más concluyente que razonar sobre el mecanismo. Un experimento
controlado de dos minutos gana a media hora de deducción sobre documentación y
schemas. Antes de teorizar sobre por qué X falla, preguntarse: *¿tengo a mano
algún Y del mismo tipo que ande?*

Corolario: un mensaje de error de un sistema ajeno describe **dónde se rompió su
código**, no necesariamente **qué le falta a tu configuración**. Acá
`getAuthChannel()` no encontraba canal en el contexto de auth; leerlo como "el
canal no existe" agregó una capa de interpretación que no estaba en el dato.
