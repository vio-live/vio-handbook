# Productos de Careless en QA (21/10)

Para el artículo de Mote & Livsstil «10 nyheter vi ønsker oss nå»: cinco productos de Careless. Contexto en el
[journal del 21/10](../../../journal/2026-10/2026-10-21-replit-paridad-vev-y-careless-qa.md).

## Scripts

- `export-careless-prod.js`: **solo lectura**, en el pod de users de prod. Busca los cinco productos de Careless
  (usuario 1327) por id de Shopify y vuelca producto, variantes, opciones, imágenes y filas ligadas en JSON por stdout.
  Sale con código 3 si falta alguno. El 21/10 no encontró ninguno: Careless no los ha exportado a Vio.
- `import-careless-qa.js`: crea los productos en QA con ids nuevos, en una transacción por producto. Si el usuario ya
  tiene un producto vivo con el mismo id de Shopify, lo salta. Escribe `product`, `variant`, `option`, `image`,
  `imported_product`, `product_shipping` y, con `QA_CHANNEL_ID`, `channel_group` y `channel_user_products`, que es
  lo que el catálogo de un channel lee. Se niega si el channel ya vende otra marca.

## Cómo correrlos

Los datos de la tienda, si no hay export de prod (el import los lee de una carpeta `shopify/`):

```bash
mkdir -p shopify && for h in cassia-mid-jacket-brown hennie-cardigan-beige vilde-genser-chocolate-brown sofie-genser-brun active-teddy-jakke-brun; do curl -sL "https://careless.no/products/$h.js" -o shopify/$h.json; done
```

Armar el script autocontenido y probar sin escribir:

```bash
node import-careless-qa.js --bundle shopify/ > run-import.js
```

```bash
P=$(kubectl --context kubernetesqa-sc get pods --field-selector=status.phase=Running -o name | grep users- | head -1)
kubectl --context kubernetesqa-sc exec -i ${P#pod/} -c users -- env QA_USER_ID=<id> QA_CHANNEL_ID=<id> DRY_RUN=1 sh -c 'cd /usr/src/app && node -' < run-import.js
```

Sin `DRY_RUN=1` escribe. El export de prod igual, con `--context vio-commerce-prod-sc`, sin variables, y el JSON que
saca se pasa a `--bundle careless-5.json` en lugar de `shopify/`.

## Lo que hay que saber

- **Puerto de QA:** el `.env.local` de QA deja `DB_PORT` vacío; los scripts usan `DB_PORT || TYPEORM_PORT`.
- **`product.active`** vale 0 por defecto en QA y el catálogo filtra por 1: el import lo pone a 1.
- **Stock inventado** desde la tienda: 10 por talla disponible, 0 si está agotada (`QA_FORCE_STOCK` lo cambia).
- **Imágenes webp** quedan con la URL de Shopify; en prod el micro de products las sube a Azure como jpg.
- **Nunca conectar la cuenta de Careless de QA a la tienda real** `dignitycollect`: una compra de prueba crearía un
  pedido real en su Shopify.
- Ensayo en QA del 21/10 con un usuario de prueba: 5 productos, 35 variantes, 38 imágenes, columnas correctas.
