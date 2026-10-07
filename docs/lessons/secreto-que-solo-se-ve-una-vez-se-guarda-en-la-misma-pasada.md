# Un secreto que solo se enseña al crearlo se guarda en la misma pasada, o no existe

**Síntoma.** El webhook está registrado, el proveedor entrega, el cuerpo y las cabeceras son
correctos, y aun así todas las entregas se rechazan por firma. Nada está "caído": simplemente
**nadie tiene la clave** con la que el proveedor firma.

**Causa real.** Vipps (y cualquier API de este estilo) devuelve el secreto del webhook **una única
vez, al registrar**. Si quien registra no lo persiste en ese mismo momento, el registro queda vivo
y sordo: firma eventos que nadie puede verificar. Peor, si alguien registra otra vez "a ver qué
pasa" y tampoco lo guarda, quedan dos registros y los dos reintentan siete días.

En QA (07/10) hubo tres registros en cadena sobre el MSN 545865: el del 06/10 con su secreto en el
blob, uno posterior de otra persona cuyo secreto se perdió —el que rompía todo— y el definitivo.
Durante días las ventas entraron igual (la orden la crea el retorno del comprador), así que el
fallo era invisible desde el negocio: lo que no llegaba eran las capturas, devoluciones y
cancelaciones hechas desde el portal del proveedor.

**Cómo se evita.**

1. Registrar y persistir son **un solo paso**, no dos tareas. Antes de llamar al registro, tener
   decidido y abierto dónde se escribe el secreto.
2. Guardar también **el id del registro** junto al secreto. Sin el id no se puede saber si el
   secreto que tienes es el del registro que está vivo — que es justo lo que pasó aquí.
3. **Inventariar antes de registrar** (`GET` de los webhooks de la unidad) y comprobar que el
   endpoint de registro borra el viejo. Si devuelve un contador de reemplazos, exigir que venga
   en 1: un 0 significa que no encontró el anterior y acabas con dos.
4. Si el borrado filtra por **igualdad exacta de URL**, resolver antes la URL que construye el
   servicio (desde su propio `.env`, no desde la documentación) y compararla con la registrada.
   Si difieren en un carácter, el huérfano sobrevive sin que el contador lo note.

**Cómo se comprueba sin esperar un pago.** Firma tú un evento con el `stringToSign` del proveedor
y una **referencia inexistente**: la firma se valida antes de buscar el pedido, así que no toca
nada. Y manda **primero** el mismo evento firmado con una clave equivocada: si ese no da 401, tu
prueba no está midiendo la firma y el 200 del bueno no vale nada.
Emparenta con [`feedback_test_que_nunca_falla_no_vale`].
