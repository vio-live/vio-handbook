---
date: 2026-10-28
session: quick-fix
participants: [angelo, claude]
status: live
---

# products — logo del transportista en la clase de envío (`logoUrl`)

## Goal

Que cada clase de envío pueda llevar el logo de su transportista (Bring, Helthjem…). La columna
llega con el kernel 1.0.286 (vio-live/package-database#30: `Entity.Shipping.logoUrl?: string | null`,
`shipping.logo_url varchar(2048) NULL`). Va con la misma rama `feat/promesas-y-envio` que graphql.
También había que averiguar si algún sync de extensions reescribe la tabla `shipping`.

## Done

- Rama `feat/promesas-y-envio` en products, desde `origin/develop` (`63afa24`). Commit local `14ce74b`.
  **Sin push ni PR**: el encargo vino de un agente y falta el OK de Angelo (ADR-0001).
- `src/modules/shipping/providers/shipping-logo.ts`: regla pura `resolveLogoUrl(value)`.
  - Campo ausente: no cambia nada.
  - `null` o un string en blanco: borra el logo.
  - Un string: se recorta y tiene que ser https (`isURL` de class-validator, `protocols: ['https']`,
    `require_protocol`), con 2048 caracteres como máximo.
  - Se rechazan http, `javascript:`, `data:`, `//host` y las URLs sin esquema.
- `ShippingService.create` y `ShippingService.update` aplican la regla antes de escribir. Un error da
  `BadRequestException` y el controller lo devuelve como 417, igual que los otros errores de shipping.
- `ShippingDto.logoUrl` lleva `@IsOptional @ValidateIf(no en blanco) @IsString @MaxLength(2048) @IsUrl(https)`.
  **Ojo: estos decoradores no se ejecutan**, porque products no tiene `ValidationPipe` global. Quien
  rechaza de verdad es el servicio.
- No hizo falta tocar ningún serializador. Las clases salen como entidad completa en todos estos
  endpoints, así que `logoUrl` sale solo:
  - `GET /shipping/id/:id`;
  - `/product-id/:productId` (`{ ...ps.shipping }`);
  - `/user-id/:userId`;
  - las respuestas de create y update.
- **products no sirve el `productShipping` que lee graphql.** Según el brief de graphql, ese payload
  viene de `all-items` y `user/v2`, que están en el micro `api`. Para que llegue el logo, `api` también
  tiene que estar en el kernel 1.0.286.
- Tests:
  - `shipping-logo.spec.ts` es nuevo, sin BD, con 33 casos: servicio, helper y decoradores del DTO.
  - `shipping.service.spec.ts` gana 6 casos con BD, que en la laptop no corren.
  - Para comprobarlo en local añadí `logoUrl` a mano a los typings del kernel instalado y lo quité al
    terminar. Con eso, `tsc -p tsconfig.build.json` sale limpio y la suite sin BD pasa entera
    (24 suites, 229 tests, con los diagnostics de ts-jest activados).
  - Contra el kernel publicado, `yarn build` solo falla con
    `TS2339: Property 'logoUrl' does not exist on type 'Shipping'` (×2).

## Decisions

- Un string en blanco borra el logo, igual que `null`, porque es lo que manda un campo de formulario
  vaciado. Un string que no es URL https se rechaza; no se ignora.
- No subí `@vio-/*` ni añadí `resolutions`. Los 7 paquetes se mueven juntos y lo hace el bot del bump.

## ¿Un re-sync puede borrar un logo?

**No.** Lo miré en extensions (`origin/develop` `bb2f2a3`), solo leyendo.

- Inyecta `ShippingRepository`, pero nunca lo usa.
- El único acceso a datos de envío es una **lectura**: `shopify.service.ts:1617`, que lee
  `productShipping → shipping → shippingCountry` para montar el delivery profile en Shopify.
- En Woo, `createShippingClass` y `deleteShippingClass` trabajan con las shipping classes **de la tienda
  Woo**, por REST, no con nuestra tabla.
- Magento no toca shipping.
- No hay SQL crudo ni HTTP a `products/shipping/create|update`.

Dentro de products, la tabla `shipping` solo se escribe en `create`, `update`, `delete` (soft) y
`consistencyDefault`, que hoy no llama nadie.

- Los imports llegan por `callAddShippingClass` y `add-or-return-previous`. Solo **crean** una clase
  "Default Shipping" si la cuenta no tiene ninguna. Nunca reescriben una existente.
- El bulk o `newUpdate` con `shippingIds` rehace `product_shipping`, no `shipping`.
- Un `PUT` que no manda `logoUrl` conserva el logo.

## Blockers / open questions

- Hace falta el kernel 1.0.286 publicado y bumpeado por el bot. Antes de desplegar, la migración de
  `logo_url` tiene que estar corrida en el entorno. Si no, cualquier select de `Shipping` revienta con
  `Unknown column`.
- Push y PR a `develop` cuando Angelo dé el OK. El cuerpo del PR está preparado.

## Next session

- Con el OK: `git push -u origin feat/promesas-y-envio` y `gh pr create --base develop`.
- Cuando salga el kernel 1.0.286: correr `shipping.service.spec.ts` con BD.
