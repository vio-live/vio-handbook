---
title: "Lección: un embed de terceros dentro de shadow DOM puede no renderizar nunca"
last-updated: 2026-09-07
owner: angelo
status: live
---

# Un embed de terceros dentro de shadow DOM puede no renderizar nunca

`<vio-checkout>` es un componente Lit, así que su contenido vive en un **shadow root**.
Los checkouts embebidos se montan inyectando el snippet del proveedor ahí adentro. Con
Kustom funcionó desde el primer día, así que se asumió que el patrón servía para todos.

Con **Qliro y Walley no**: el snippet se inyectaba, el `<script>` se ejecutaba, el
contenedor quedaba en el DOM… y el widget no aparecía. Sin error, sin excepción, sin nada
en consola. Sus scripts de bootstrap resuelven el punto de montaje **desde el documento**,
y un elemento dentro de un shadow root es invisible para eso. El de Kustom, en cambio,
resuelve el padre de su propio `<script>`, que sí atraviesa.

## Cómo se comprobó, en 30 segundos

El mismo snippet, montado dos veces en la misma página:

```js
// dentro del shadow root → qliro-root queda con 0 hijos, 0 iframes, altura 0
// en light DOM          → qliro-root con 1 hijo, 1 iframe, altura 200
```

Eso convirtió una sospecha en un hecho sin leer una línea del script de terceros.

## El arreglo

El contenedor pasa a vivir en el **light DOM** como hijo del host, y se proyecta de vuelta
al panel con un slot con nombre, así el layout no cambia:

```ts
const el = document.createElement('div')
el.id = id
el.setAttribute('slot', slotName)   // <slot name="vio-qliro"> en el panel
this.appendChild(el)                 // hijo del host: visible para document.*
```

## Qué mirar la próxima vez

- Cualquier **embed de terceros** (PSP, chat, mapas, video) dentro de un web component es
  candidato. Si el proveedor documenta "poné un div con este id", casi seguro lo busca por
  `document`, y el shadow DOM lo rompe.
- El síntoma es **silencio**: no hay error que buscar. Si el contenedor existe y está vacío
  después de que el script corrió, sospechá de esto antes que de la red o las credenciales.
- Que un proveedor funcione no dice nada de los otros: cada script resuelve su montaje a su
  manera.

Arreglado en `vio-web-sdk` 0.9.1 (PR
[#31](https://github.com/vio-live/vio-web-sdk/pull/31)), junto con el otro defecto que
tapaba a este: los mounts embebidos creaban el checkout sin aceptar las condiciones de
compra, y shopcart rechaza iniciar el pago en ese caso.
Ver [`architecture/payments.md`](../architecture/payments.md).
