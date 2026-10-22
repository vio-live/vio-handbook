# El tipo de channel no es el transporte (Sdk vs GraphQl)

**Síntoma / confusión:** ver que en QA todos los channels que funcionan son de tipo `Sdk` (10) y
concluir que el channel de un publisher «tiene que ser Sdk y no GraphQl» (12). Angelo lo cuestionó
de inmediato: «Commerce va por GraphQL». Tenía razón.

**Causa real:** `channel_user.channel_id` **no** describe el transporte, sino *el tipo de channel*
del publisher. El transporte del SDK web es siempre GraphQL: el SDK llama al servicio `graph-ql`.

En `graph-ql`, `src/Infra/Utils/Auth.js`:

- `channelIdByAuthInfo` marca `apply = true` (filtrado por canal) **solo** cuando el tipo **no** es
  9, 10 ni 12.
- `getAuthChannel` toma `channelIdGeneral` + `channelId` directo del login de la api key cuando el
  tipo **es** 9 (Api), 10 (Sdk) o 12 (GraphQl).
- O sea: **los tres son equivalentes** para el camino de api key. Cualquier otro tipo (Shopify, Woo,
  Vev…) va por la otra rama.
- El propio archivo tiene un comentario sobre el bug que lanzaba *"The user does not have an
  assigned channel"* para toda key cuyo canal no fuera 9/10/12.

Aguas abajo, `channelService.getAllItems` del micro `api` hace
`if (channel_id) query.andWhere('channel.id = :channel_id')` con el tipo que viene de la key. Como la
key pertenece al propio `channel_user`, el filtro es autoconsistente: 10 y 12 devuelven lo mismo.

**Lo que sí decide si hay botón de pago** no es el tipo, es `channel_user_settings.vipps = 1`
cruzado con el switch de la marca (ver `getAvailablePaymentMethods` -> `offeredPaymentMethods`).

**Lección de método:** un patrón repetido en los datos de un entorno ("10 de 10 son Sdk") es una
pista, no una regla. Antes de presentarlo como requisito hay que encontrar **dónde lo exige el
código**. Si no aparece, es correlación — y en este caso venía de cómo el dashboard fue creando los
channels, no de una restricción.
