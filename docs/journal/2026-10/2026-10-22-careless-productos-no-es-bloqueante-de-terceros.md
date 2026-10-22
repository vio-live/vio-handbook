## B2 corregido: los 5 productos del articulo YA estan en el Shopify de Careless — Miguel

- Quién: Miguel. Lo disparó Angelo al decir "careless tiene una cuenta en prod con la app de
  shopify instalada" (22/10 16:49 Oslo).
- Dónde: base de **producción** (`outshifter`, lectura) y la Admin API de
  `dignitycollect.myshopify.com` (**solo lecturas**: `products/count`, `products.json`, GraphQL
  `products(query:)`), con el token de la propia app.
- Cuándo: 22/10/2026, ~16:55 Oslo.

### Lo medido

- **La app está instalada y la conexión está viva**: `shopify_connection` id **541**,
  `supplier_id 1327` (Careless), `url dignitycollect.myshopify.com`, `currency NOK`,
  `deleted_at NULL`, token refrescado hoy 14:40Z.
- **Su Shopify tiene 1.729 productos.** En Vio hay **40** de Careless (39 activos), **todos
  importados el 16/10** y **todos de la línea «Active»** — es la primera página alfabética del
  catálogo, y ni siquiera completa.
- **Los 5 productos del artículo SÍ existen en su Shopify**, todos `ACTIVE`, publicados y con
  stock:
  - Cassia jakke — Brun (253), Svart (232)
  - Hennie cardigan — Beige (145), Svart (260). *Lys rosa y Lys blå están sin publicar y a 0.*
  - Vilde genser — Brun (151), Burgunder (193)
  - Sofie genser — Brun (170). *Lilla a 0 de stock.*
  - Active pile fleece half-zip — Beige (345), Brun (163)

### La corrección

Lo que escribí esta mañana en el checklist — «**nadie de nuestro lado puede hacerlo**, es el ítem
con más plazo de terceros» — **es falso**. No hay nada que pedirle a Careless: los productos ya
están en su tienda, activos y publicados. Lo que falta es **importarlos de nuestro lado**, y el
mecanismo existe: `POST /product/shopify/import` (y `POST /product/import/shopify/product`) en el
micro `products`.

El error de método fue dar por bueno el estado de la base de Vio como si reflejara el catálogo de
la marca. Lo que había que mirar es **el origen** — y para eso el token de la conexión viva alcanza,
en modo lectura.

### Pendiente / decisión de Angelo

- **No importado todavía**: escribe en la base de producción. Espera su OK.
- Recomendación: importar **solo los del artículo y sus colores con stock**, no los 1.729. Meter
  1,7k productos con sus imágenes en prod a dos días del go-live añade tiempo de consolidación de
  imágenes, escritura en el blob y ruido en el catálogo, sin nada a cambio para el lunes.
- Excluir `Sofie genser - Lilla` y los dos Hennie sin publicar: stock 0.
- **C4 sigue en pie** y es independiente: hay que avisar a Careless de que una devolución hecha en
  su Shopify mueve dinero real en Vipps.
