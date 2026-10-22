---
title: Los dos metodos de envio de Careless cargados en prod (E1b/E1c)
date: 2026-10-22
last-updated: 2026-10-22
tags: [produccion, careless, envio, go-live, shopify, packrooster]
---

## Metodos de envio de Careless en Vio, en NOK y con los nombres de Shopify — Miguel

- Quién: Miguel, a pedido de Angelo (lo pasó el agente `vio` desde el checklist del go-live).
- Dónde: MySQL de **produccion** (`outshifter`), tablas `shipping`, `shipping_country` y
  `product_shipping`, usuario **1327** (Careless). Via pod de `users` con su propio `mysql2`
  (sin abrir el firewall de la base).
- Cuándo: 2026-10-22 ~21:58 CEST.
- Contexto: Careless tenia **un** metodo, «Default Shipping» 10,00 NOK, que es el placeholder del
  alta. Sus ordenes reales no usan tarifas de Shopify: el envio lo calcula **Packrooster** y
  despacha **360 Logistics**, y la equivalencia se busca **por nombre**. Con «Default Shipping» la
  orden que crea Vio salia sin transportista y sin despachar. Cierra E1b y el subpunto de E1c.

### Hecho (una transaccion, con ensayo en rollback antes)
- `shipping 60af8d5a-9b2a-4daf-91f3-28a7aa6e6f75` → `name` «Helthjem - til postkasse/dørmatte»,
  `description` «Leveringstid 1-5 dager», `amount` **59.00**, `NOK`, `default = 1`.
  Su `shipping_country` (NO) a 59.00 NOK.
- `shipping f831b031-d557-471b-a401-32376a8fcc73` (nuevo) → «Bring - Pakke i postkasse»,
  «Leveringstid 1-5 dager», **79.00** NOK, `default = 0`, `custom_price_enabled = 0` (igual que el
  otro). Su `shipping_country` (NO) a 79.00 NOK.
- `product_shipping`: **40 filas nuevas** al metodo nuevo, una por cada producto que ya colgaba del
  otro. Quedan 40 y 40.
- Importes: los eligio Angelo el 22/10 con los precios de la web de Careless.

### Por que 40 y 40 y no solo el metodo nuevo
`sharedShippingClasses` (en `shopcart/dist/modules/cart/providers/shared-shipping.js`) **interseca**
las clases de envio de todos los productos del carrito. Un metodo que no cuelgue de **todos** los
productos no se ofrece nunca. El flag `default` no interviene en esa eleccion.

### Verificacion
- **Transaccion con aserciones**: precondiciones (exactamente 1 metodo vivo y 40 `product_shipping`)
  y relectura comprobada (nombres, importes, moneda, `default`, 2 paises, 40+40) **antes** del
  commit. Primero un ensayo completo que termino en `ROLLBACK` deliberado.
- **Los nombres no se transcribieron a mano**: se extrajeron del `SHOPIFY_SHIPPING_LINES` del
  Secret vivo `env-sc-extensions`, que es el otro lado de la equivalencia.
- **La funcion real de `extensions`, dentro del pod de prod**, sobre los nombres **leidos de la
  base** (no sobre los que yo quise escribir): `shippingLineFor` devuelve
  `helthjem|2|#13435` y `bring|3584|#13452`, las dos con `source Packrooster`.
  **Control negativo:** «Default Shipping» devuelve `null`, asi que la prueba no pasa sola.
- **Sin caches que invalidar**: ni `api` ni `shopcart` cachean respuestas en ese camino.

### Gotcha que puede morder a otro
La columna `shipping.name` es **`latin1`** (toda la base lo es) y la conexion va en `utf8mb4`.
La «ø» (U+00F8) sobrevive porque existe en latin1: vuelve de la base como `c3b8`, byte a byte igual
que la clave del mapa. Comprobarlo con bytes, no a ojo: un nombre con mojibake se ve casi
igual en la consola y **no resuelve** la equivalencia. Ojo con cual mira cada uno:
`HEX(name)` en MySQL devuelve **`...64F8726D...`** (los bytes latin1 en disco) y el driver devuelve
**`...64C3B8726D...`** (UTF-8 ya convertido). Las dos cosas son correctas y describen la misma fila;
lo que tiene que casar con la clave del mapa es la **del driver**.

**Y no se puede hacer desde el dashboard**: la cuenta 1327 tiene `settings.currency` **EUR** y el
dashboard guarda las clases en la moneda de la cuenta, asi que las dejaria en EUR y desharia E1.
Por eso va por base. Cambiar la cuenta a NOK no es inocuo (`products`, `api` y `orders` la usan) y
no se toca antes del lunes.

### Pendiente
- Sigue siendo de Careless: en su web Helthjem es **gratis desde ~1.500 NOK** y el modelo de Vio no
  soporta umbrales de envio gratis. Si lo quieren, es trabajo de producto.
- La orden de prueba de punta a punta en prod (que Packrooster actue sobre una orden creada por API)
  sigue abierta en E1c y es de Angelo con Careless.
- Respaldo de las 42 filas previas: `prod-backup/backup-shipping-1327-20261022.json` en el workspace
  de Miguel. Deshacer = restaurar esas filas y borrar `f831b031-...` (lo demas cae por cascada).

## Verificacion de la orden de prueba preparada, y los codes confirmados contra ordenes reales — miguel

- Quien: miguel (a raiz de Angelo, 22/10 22:08: «lo importante es que la orden se ponga y se envie»).
- Donde: prod. Lectura del pod `users-86b6d95f5b-hwfqw` + Admin API 2024-04 de
  `dignitycollect.myshopify.com`. Ninguna escritura, ni en la base ni en Shopify.
- Cuando: 2026-10-22 22:40-22:55 Oslo.
- Contexto: manana viernes se corre la orden de prueba de punta a punta. Lo que hacia falta era
  poder mirar la orden sin depender del panel de Careless, y saber con que comparar.
- Hecho:
  - Guion nuevo `docs/playbooks/scripts/verificar-orden-careless.sh` (solo lectura). Saca el
    `access_token` vivo de `shopify_connection` (conexion **541**: `dignitycollect`, supplier 1327,
    NOK, token rotado hoy 20:10) y consulta la orden: `source_name`, etiquetas, `shipping_lines`
    (title/code/source/price), metafields, fulfillments, si la creo Vio y un veredicto por criterio.
    Borra su temporal del pod al salir. Probado con las 3 ultimas ordenes y por nombre (`#554326CL`).
  - **Confirmado que los dos `code` que cargue el 21:58 son los que Packrooster pone en sus ordenes
    nativas**: `#554326CL` (22:09) → `bring|3584|#13452`; `#554329CL` (22:12) → `helthjem|2|#13435`,
    las dos `source=Packrooster`. Deja de depender de mi funcion de mapeo.
  - Medido ademas: Packrooster escribe `packrooster.shipping-service` ~8-20 s despues del alta;
    una orden recien puesta esta `authorized` + sin fulfillments (el despacho es posterior, asi que
    `despachada=NO` al minuto no es fallo); y existen variantes de punto de recogida
    (`helthjem|86|<idPunto>|#13940`) que Vio no puede expresar — las ordenes de Vio iran siempre a
    domicilio/buzon.
  - El umbral de envio gratis de su web, con numeros: 2.059,50 NOK y 3.903,00 NOK con envio 0,00.
    Refuerza el aviso C5 de la checklist.
- Pendiente: la orden de prueba en si (Angelo + Careless, viernes). El unico criterio que no se
  resuelve en el minuto es el despacho de 360 Logistics.
