# Una columna latin1 que recibe utf8mb4 tumba el micro, no solo la consulta

**Sintoma.** Dos pods de `api` en produccion con `restarts=1`, `reason=Error`, `exitCode=1`, a las
21:40:15 y 21:56:53 UTC del 22/10 — los segundos exactos en que se creo y se borro un channel desde
el dashboard. En el log del contenedor anterior:

```
data: { message: "Incorrect string value: '\\xE2\\x9C\\x94 Me...' for column 'description' at row 1",
        failed: true },
isAxiosError: true
...
Node.js v22.23.4
error Command failed with exit code 1.
```

`\xE2\x9C\x94` es **✔** (U+2714) en UTF-8.

**Causa real.** Al publicar productos en un channel se copia `product.description` a
`channel_user_products.description`. En la base de prod:

- `product.description` → **utf8mb4**
- `channel_user_products.description` → **latin1**

MySQL rechaza la escritura. El micro que inserta devuelve `failed: true`, `api` lo recibe por axios
y **no maneja el rechazo**: la promesa queda sin capturar y el proceso sale con 1. O sea, un dato
con un caracter corriente **reinicia el servicio que sirve la pagina de pago**, no solo falla la
operacion.

No es un caso raro: **48 de los 49 productos de Careless** tienen `description` con caracteres que
latin1 no aguanta (medido con `HEX(CONVERT(description USING latin1)) <> HEX(description)`).

**Arreglo aplicado (23/10 00:5x, prod).**
```sql
ALTER TABLE `channel_user_products`
  MODIFY `description` TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;
```
Seguro de hacer: la columna **no tiene indices** y solo habia **15 filas**. Respaldadas antes en
`prod-backup/channel_user_products-pre-utf8mb4-20261023.json`; despues del ALTER las 15 siguen con
el **mismo MD5 y la misma longitud**. Probado que ahora entra: INSERT con `✔ Mega god kvalitet —
prøv den!` dentro de una transaccion, leido de vuelta identico, y `ROLLBACK`.

**Lo que NO habia que tocar.** Las otras columnas latin1 de esa tabla (`tags`, `sku`, `barcode`,
`origin`, `brand`, `collection_id`, `price_currency_code`) son latin1 **tambien en `product`**: la
copia es latin1 → latin1 y no hay desajuste. `title` ya era utf8mb4 en las dos. `description` era la
unica pareja descompensada. Convertir las demas habria sido ruido.

**Como se encuentra esto.** Comparar el charset de origen y destino de cada copia, no el charset
"de la base":
```sql
SELECT TABLE_NAME, COLUMN_NAME, CHARACTER_SET_NAME
FROM information_schema.columns
WHERE table_schema = DATABASE() AND CHARACTER_SET_NAME <> 'utf8mb4';
```
En prod salen **425** columnas latin1. La mayoria son inofensivas (las dos puntas coinciden); la que
duele es la que recibe de una utf8mb4.

**Pendiente de fondo, no urgente.** `api` deberia manejar el `failed: true` de las llamadas internas
en vez de morirse. Mientras no lo haga, cualquier rechazo de la base en un micro vecino es un
reinicio de `api`. Y la conversion deberia vivir en una migracion de `package-database` (hay
precedente: `CartAttributionUtf8mb41792400000000`), no en un ALTER a mano como este.
