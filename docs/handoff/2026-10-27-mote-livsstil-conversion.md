# Mote & Livsstil × Careless — plan de conversión y operación diaria

**Estado al 27/10/2026.** Contexto: [journal 2026-10-27](../journal/2026-10/2026-10-27-go-live-mote-livsstil-careless.md).
Para quien retome la campaña: qué está en vivo, cómo se reporta y qué hay que mejorar, por prioridad.

## Qué está en vivo

| Pieza | Valor |
|---|---|
| Artículo | `https://www.moteoglivsstil.no/mote/annet/norsksuksesskvinnerfarikkenokavdisseplaggene` (`content_id` 189; antes `derforelskernordmenndisseplaggene`) |
| Host | Replit (Aller), SDK web 0.29.0 |
| Analytics | surface 1 «Mote Livsstil Hub», campaña 2 «Careless», slots `article-189-block-2…12` |
| Commerce | channel 482 (user 1330 Aller), colección «Careless Pilot collection» `927UL4Z6k` (11 productos) |
| Pago | Vipps Express; la descripción del pago lleva producto y talla (shopcart #106) |
| Avisos de pedidos | Slack `#vio-ordenes` (iqplusworkspace) |

## Reporte diario (operación)

- Lo genera la laptop de Angelo con tareas programadas de Claude: página privada a las 00:04 y **PDF a las 00:01**
  (`~/vio-reportes/mote-livsstil/pdf.py`). El PDF llega a Angelo por la app y el resumen a `#vio-ordenes`. El envío
  por Gmail queda pendiente: el conector no tiene permiso de envío.
- Reglas del reporte para el cliente: **en noruego**, sin desglose por slot (es interno), «Dag N» con el 26/10 como
  día 1, día anterior en hora de Oslo.
- Definiciones: usuarios = navegadores únicos (quien rechaza cookies cuenta una vez por página vista); «Til kassen» =
  sesión que inició el pago en Vipps; compra = orden pagada confirmada por Commerce (ADR-0039).
- **Se restan las pruebas internas**: 6 `anon_id` de Angelo y Michael (lista en `pdf.py`, `INTERNAL`), con
  `/v1/stats/recent`. Se pidió a Miguel borrarlos en ClickHouse; cuando lo haga, la resta deja de ser necesaria.
  Los agentes del análisis del 27/10 dejaron algunas visitas y un carrito de prueba: hay que excluirlos del día 2.
- Día 1 (26/10): 1 344 usuarios, 9 310 impresiones, 366 clics (CTR 3,9 %), 7 carritos, 2 pagos iniciados, 0 compras.

## Diagnóstico (5 agentes: UX, contenido, embudo, marketing, técnico; 27/10)

- Arriba del embudo funciona: CTR ~4 % y 1 de cada 5 visitantes abre un producto.
- Se rompe entre la ficha y el carrito (~2 %, en moda lo normal es 6–7 %) y nadie que añadió desde el móvil pagó.
- En lo comercial el artículo es peor que careless.no: allí hay −15 % del Careless Club en la primera compra, envío
  gratis desde 1 500 kr y outlet; en el artículo, precio completo y envío visible solo en Vipps.
- El tráfico fue un solo empujón de Dagbladet de ~8 h. Con ~360 clics, 0 pedidos pasa ~16 % de las veces: hacen falta
  7–14 días y otro empujón para juzgar.

## Mejoras por prioridad

Nada de esto está empezado: Angelo no ha dado el OK todavía.

**P0 — fallos que pueden tumbar una compra (Vio)**
1. Talla preseleccionada en XS: el aviso «Få igjen» sale falso y con Vipps se podría comprar una XS sin elegirla.
   Obligar a elegir talla. *(SDK; confirmar en el código antes de tocar)*
2. Checkout de 0 kr con el carrito vacío: bloquearlo en SDK, Replit y shopcart (hoy lo acepta).
3. Ficha en escritorio: la barra sticky tapa las tallas; mientras cargan los métodos aparecen Stripe/Klarna. *(SDK)*
4. Navegadores in-app (Dagbladet, Facebook; ~30 % del tráfico, 0 carritos): Replit bloquea si falla `localStorage`;
   el salto a Vipps llega varios segundos tarde (9 llamadas en serie) y iOS puede no abrir la app. *(Replit + SDK)*

**Conversión rápida**
5. Envío, entrega y devolución visibles en la tarjeta, la ficha y el total del carrito. *(SDK)*
6. Un solo CTA por tarjeta («Velg størrelse og kjøp») + «du betaler med Vipps og blir værende i saken». *(Replit)*
7. Tras «Legg i handlekurv», aviso con «Til kassen». *(SDK)*
8. Oferta para lectores igual o mejor que la del Club, con fecha límite real. *(Careless; Vio la configura)*

**Contenido (Aller)**
9. 3 productos destacados tras la entradilla; agrupar colores (11 → 6 tarjetas); bajar las tights (CTR 1,8 %).
10. Texto por producto, talla de la modelo, firma real, título con el número correcto, mencionar a la fundadora.
11. Quitar el carrusel de la competencia; arreglar el JSON-LD (lista otras marcas).

**Tráfico (Aller + Careless)**
12. Segundo empujón en Dagbladet, newsletters (Mote/KK, Careless Club), stories, todo con UTM.
13. Código de campaña para medir el efecto en careless.no.

**Técnico y medición (Vio)**
14. Reservar espacio de las tarjetas (aparecen tras 1,6 s; 4–6 s en móvil real), no cargar Stripe si la marca solo
    cobra con Vipps, imágenes más ligeras y caché.
15. `add_to_cart` y `begin_checkout` en todos los caminos de compra, errores de pago, marca de navegador in-app y de
    tráfico interno. La SDK la publica Angelo.

## Abiertos que afectan a la campaña

- **Colores = productos distintos en Shopify.** Careless une los colores con «sibling products» del tema (sin app).
  Vio importa cada color como producto aparte; agruparlos es trabajo nuestro (por nombre común o leyendo el tema).
- **Posible producto en preventa.** «Active flared tights m/3 lommer u/s – Chocolate brown» está en «Kommer snart» en
  careless.no. Falta comprobar en prod si alguna de las tights del artículo (421211, 421213, 421208) es ese producto;
  si lo es, Vio vende algo que Careless aún no envía.
- Resiliencia de prod: ver la lección [caídas al mover pods](../lessons/caidas-al-mover-pods-en-aks.md).
