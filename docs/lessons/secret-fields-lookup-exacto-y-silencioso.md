# El mapa de campos secretos se busca por nombre exacto, y falla en silencio

**Síntoma.** Activas `PAYMENT_SECRETS_KEY`, corres `reencrypt-all`, te devuelve
`{total, changed}` con un número razonable y das el cifrado por completo. Pero quedan
filas de `payment_method` con secretos en texto plano y nada lo reporta.

**Causa real.** Dos cosas, las dos silenciosas:

1. `encryptOptionsForWrite` resuelve los campos a cifrar con
   `SECRET_FIELDS[options?.name] ?? []`. Es un acceso por clave **exacto y sensible a
   mayúsculas**, con array vacío de reserva. Un proveedor cuyo `name` no esté literalmente
   en el mapa no cifra nada y no lanza ningún error. En QA (07/10) el mapa tenía la clave
   `Klarna` y en la base había filas guardadas como `KLARNA`, más dos como
   `STRIPE payment link` y una sin `name`. Ese día no expusieron nada porque esas filas solo
   tenían `{"name": ...}` sin credencial — pero en cuanto alguien guarde una credencial con
   esa grafía, se queda en plano sin avisar.
2. `reencryptAll` recorre `repository.find()`, que con `@DeleteDateColumn` **excluye las filas
   con borrado lógico**. En QA quedaron 10 campos secretos en plano en 13 filas borradas
   (6 de Stripe, 4 de Kustom). Siguen siendo legibles con un `SELECT`: el borrado lógico no
   es borrado.

**Cómo se evita.** No te fíes de `changed`: es cuántas filas tocó, no cuántas faltaban.
Antes de cifrar, cuenta desde la base cuántas filas *deberían* cambiar, usando el mapa real del
código, y compara contra el `changed` que devuelve el endpoint. En QA la predicción fue
`total:23 changed:15` y salió exactamente eso — por eso se pudo afirmar que la clave estaba cargada.
Después, cuenta los campos que **no** empiezan por `enc:v1:`, y hazlo también con
`deleted_at IS NOT NULL`, que es donde se esconde el residuo.

Si el conjunto de proveedores es abierto, el mapa debería normalizar la clave (comparar sin
mayúsculas) o fallar ruidosamente ante un `name` desconocido en lugar de devolver `[]`.
