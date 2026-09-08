---
date: 2026-09-08
session: "La primera compra real con Qliro, y los siete defectos que la separaban de funcionar"
participants: [angelo, claude]
status: live
---

# La primera compra real con Qliro

**Objetivo.** Angelo probó el flujo completo en una página real de Vev
([bohus-demo](https://a-vio-dev.vev.site/bohus-demo)). Todo el backend de Qliro estaba
mergeado y verificado por API desde ayer; nadie había intentado comprar desde el navegador.

**Resultado: compra completada.** Qliro `5559819` → orden **4248** en Commerce, en 2,3
segundos desde el push. Entre el inicio y ese punto aparecieron **siete defectos**, todos
en el SDK, ninguno detectable por el E2E de API.

## Los siete

**1. El bootstrap corría antes del init.** `getCartGraphQLOptions` intentaba
`facade.bootstrap()` antes de que `Vio.init` hubiera corrido, lanzaba *"Not initialized"*,
se tragaba el error y **nunca reintentaba**. Sin bootstrap no hay sponsor; sin sponsor, la
clave de Commerce caía a la de vio-backend. Commerce la rechaza → `Authentication failed`.
Una clave **equivocada**, no ausente, y por eso se leía como problema de credenciales.

**2. El carrito no tenía salida.** El pie era **sólo de pago exprés** (Apple Pay, Stripe,
Klarna, Vipps). Kustom, Qliro y Walley no tienen camino exprés, así que un canal que ofrece
sólo esos renderizaba un pie con **cero botones**. Medido: 4 botones en el panel, todos de
cerrar y cantidad, y el panel sin desbordar — no era recorte, no había CTA.

**3. El checkout parpadeaba con todos los métodos** mientras cargaba la lista.
`availableMethods === null` no distinguía "aún no pregunté" de "pregunté y falló".

**4. El formulario de dirección se saltaba tarde** — sólo después de elegir método, así que
el checkout abría pidiendo datos que Qliro volvía a pedir.

**5. La auto-selección entró en bucle.** Regresión mía, desplegada y rota en una hora.
`selectPaymentMethod` es una **petición, no una garantía**: cuando no cuajaba, el cambio de
estado recargaba la lista, que volvía a auto-seleccionar, y **cada pasada remontaba el
widget**. Cientos de peticiones al endpoint `orders` de Qliro.

**6. Registrar `onOrderUpdated` iniciaba una sincronización.** Su documentación lo dice —
*"Initiates the order sync process"*— y yo lo leí como precondición sobre cuándo **dispara**
el callback, no sobre cuándo se **registra**.

**7. El recibo lo reemplazaba el paso de pago.** Al volver, se pintaba el recibo, se emitía
el éxito y se **vaciaba el carrito** — un cambio de estado que re-renderizaba con cero
ítems y se llevaba el recibo. El cliente veía su confirmación y luego "cómo quieres pagar".
Invita a pagar dos veces.

## Lo que la compra real verificó

Los tres arreglos de ayer, con dinero de test:

| | Resultado |
|---|---|
| Producto correcto | `411731`, SKU `317353` — el comprado, no uno arbitrario |
| IVA del envío | envío 199, IVA total 1039,6 = producto 999,8 + envío 199,8 → **25 % exacto** |
| Validación previa al cobro | corrió y aprobó, con la URL firmada |

El del IVA era el que más importaba: ayer ese mismo desglose salía como 7,65 con 2501 %.

## Un hallazgo que no es de código

**Un `vev deploy` no alcanza a una página ya publicada.** La página queda clavada al bundle
con el que se publicó; hay que republicarla. Verificado por el hash del fichero servido.
Anotado en [`architecture/vev.md`](../../architecture/vev.md).

## Datos de prueba de Qliro

**No hay tarjeta de test: se prueba con número de identidad.** Noruega B2C: `22034149589`
aprueba, `23034114714` deja en espera, `23034114986` rechaza. El resto de mercados en su
[página de Testing](https://developers.qliro.com/docs/qliro-checkout/get-started/testing).
Anotado en [`payments.md`](../../architecture/payments.md).

## La venta no llegaba al vendedor

La pregunta de Angelo: *"¿la orden también se crea en el sistema del sponsor?"*

**No.** Y el mecanismo llevaba tiempo construido: `vio-orders-microservice` hace POST de
cada orden pagada a `settings.orderWebhookUrl`, firmado con HMAC. Pero **nada podía escribir
esas dos columnas** — existían en el kernel, `orders` las leía, y la única forma de ponerlas
era un UPDATE a mano.

Hecho: los dos campos en Settings → API & SDK (webapp#12). Con una trampa que conviene
recordar: se escriben por `PATCH /users/:id { settings }`, que guarda el objeto entero.
**No** por `PATCH /settings/:id`, que destructura cuatro campos conocidos y descarta el
resto **en silencio**.

⚠️ **El envío hace un solo reintento inmediato y se rinde.** Si el endpoint del vendedor
está caído dos segundos, esa orden se pierde. Para demo vale; antes de producción con
dinero real, no.

## Mejoras del mismo día

- Botón **"Kjøp nå"** en la ficha para los checkouts embebidos — la misma laguna del
  carrito, en otro archivo. En un canal sólo-Qliro la ficha no ofrecía **ninguna** forma
  de comprar.
- **Auto-selección** cuando hay un único método, y **"Endre" oculto** en ese caso.
- Spinner mientras carga la lista de métodos.

⚠️ El "Kjøp nå" **añade al carrito** antes de abrir, como los cuatro botones de marca que ya
existían: un carrito con cosas dentro las compra también. Aislar una compra de un solo
producto exige un checkout que no esté atado al carrito del sponsor — trabajo aparte,
anotado en el código.

## Lo que hay que mejorar de cómo trabajamos

Angelo lo dijo bien: *"estamos agregando y cambiando, y sería bueno pulir para que no se
convierta en un lío"*. Tiene razón, y hay evidencia:

- **729 líneas** añadidas al SDK en un día, casi todas reactivas.
- `methodEnabled` **duplicado en tres componentes** con firmas distintas.
- La distinción exprés/embebido **escrita a mano en muchos sitios** — así nacieron los
  defectos 2 y el de la ficha: el mismo olvido, dos veces, en dos archivos.
- El render del checkout es una cadena de ternarios con seis banderas que interactúan.
  El defecto 5 salió de ahí.

Y una causa de método: **el ciclo de prueba es caro** (rebundle → PR → merge → deploy →
republicación manual de Angelo). Con ese coste la tentación es desplegar hipótesis en vez
de reproducir. Caí dos veces. Lección:
[`reproducir-antes-de-desplegar-una-hipotesis.md`](../../lessons/reproducir-antes-de-desplegar-una-hipotesis.md).

Hay una revisión de código lanzada sobre el diff del día para confirmar o corregir ese
diagnóstico.

## PRs

| Repo | PR |
|---|---|
| web-sdk | #38 bootstrap · #39 carrito+spinner · #40 dirección+auto-select · #41 bucle · #42 onOrderUpdated · #43 recibo · #44 Kjøp nå |
| vev | #18 · #21 · #22 · #23 · #24 (rebundles) |
| webapp | [#12](https://github.com/vio-live/webapp-vio-commerce/pull/12) webhook de órdenes |

## Siguiente

- Pedir a Bohus la URL del webhook. Ya se puede cargar desde Settings.
- Reintentos durables del webhook antes de producción.
- Aislamiento del express checkout, y el express en las cards.
- Actuar sobre la revisión de código cuando llegue.
