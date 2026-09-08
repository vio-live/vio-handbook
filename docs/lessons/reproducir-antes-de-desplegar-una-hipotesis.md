---
title: "Reproducir antes de desplegar una hipótesis"
last-updated: 2026-09-08
owner: angelo
---

# Reproducir antes de desplegar una hipótesis

El 2026-09-08, depurando por qué el widget de Qliro se quedaba cargando y llovían
peticiones a su endpoint `orders`, desplegué **dos diagnósticos equivocados al paquete
compartido de Vev** antes de aislar el problema. Cada intento costó una republicación
manual de Angelo y unos minutos suyos.

Cuando por fin aislé —montar el snippet de Qliro **sin** ninguno de nuestros listeners— la
respuesta apareció en un minuto: cero peticiones, widget correcto. El bucle era nuestro. Y
una bisección por grupos de listeners descartó también mi segunda hipótesis.

## Por qué pasó

**Reproducir era caro y desplegar era barato.** El ciclo del SDK en Vev es:

```
esbuild → PR → merge → vev deploy → Angelo republica la página → mirar
```

Minutos, y una acción de otra persona. Frente a eso, "creo que es X, lo cambio y vemos"
parece más rápido. No lo es: es más rápido *por intento* y mucho más lento en total,
además de gastar el tiempo de alguien más y de mover un paquete compartido.

## La regla

**Antes de desplegar un arreglo a un entorno compartido, tener una reproducción que falle.**
No una teoría coherente: una medición.

Cuando reproducir parezca imposible, casi siempre es que no se ha buscado el corte:

- **Aislar el componente ajeno.** Montar el widget de terceros solo, sin nuestro código, y
  medir. Eso responde en un minuto "¿es suyo o es nuestro?".
- **Bisección.** Con siete listeners sospechosos, tres pruebas bastan. No hace falta
  adivinar cuál.
- **Contar, no mirar.** Envolver `fetch` y contar peticiones da un número; mirar la pestaña
  Network da una impresión.

## La señal de que estoy adivinando

Si la frase que estoy a punto de decir es *"esto debería arreglarlo"* en vez de *"esto falla
así, y con el cambio deja de fallar"*, no tengo un diagnóstico: tengo una corazonada. Las
corazonadas se prueban en local, no en el paquete que usa el equipo.

## Corolario para las herramientas

Un ciclo de prueba caro no es sólo incómodo: **empuja a métodos peores**. Si depurar algo
exige que otra persona haga clic, eso es deuda de herramientas y merece arreglarse antes
que el siguiente defecto.

Ver el journal del
[2026-09-08](../journal/2026-09/2026-09-08-3-primera-compra-real-con-qliro.md) y
[`architecture/vev.md`](../architecture/vev.md), que explica por qué el ciclo es así.
