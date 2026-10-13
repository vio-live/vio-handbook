---
date: 2026-10-13
session: "payment-processors: capture, cancel y refund con el vendedor del carrito (F2.4)"
participants: [angelo, claude, svc-payment-processors]
status: live
---

# payment-processors: el vendedor del carrito

## Goal

La parte de payment-processors de F2.4 del
[plan de ejecución](../../handoff/campanas-en-commerce-plan-de-ejecucion.md), según
[ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md) punto 1.

shopcart ya llena `cart.seller` con la brand que cobra
([shopcart-brand-sells](2026-10-13-shopcart-brand-sells.md)). payment-processors seguía
resolviendo las credenciales por `cart.user`, el publisher. Sin este cambio, los pagos que
vende una brand se capturan y reembolsan con la cuenta del publisher.

## Done

Dos commits locales en `feature/brand-publisher` de vio-payment-processors-microservice, sobre
`origin/develop` (`61becf8`). Están en el worktree
`~/vio-commerce/worktrees/payment-processors-brand-publisher`. **Sin push ni PR**
(ADR-0001). A la rama se le quitó el upstream para que un push no pueda ir a `develop`.

- `aa4d63d` **Kernel.** `@vio-/database` y `@vio-/service` pasan a 1.0.269, `definitions` y
  `testing` a 1.0.268, y el resto queda en 1.0.267. Es el mismo set que usan users y
  shopcart.
  - El registry npm responde "Not found" para `@vio-/*`: el token no sirve. Por eso
    **`yarn.lock` no se tocó**.
  - Para probar, `node_modules` se armó con `yarn install --prefer-offline --frozen-lockfile`
    sobre el `package.json` original. Después se reemplazó `@vio-/database` por `dist`, `src`
    y `package.json` del tag `v1.0.269` (`git archive`). Sus dependencias no cambian entre
    1.0.267 y 1.0.269.
- `25c481c` **El vendedor.**
  - **Un solo resolver** en `src/shared/payment-seller/payment-seller.ts`, que devuelve
    `cart.seller_id ?? cart.user_id`. Lee las columnas crudas con `getRawOne`, porque
    `Cart.seller` no es eager. Stripe (`sellerOf`) y Klarna (`authFor`) tenían copias
    distintas y ahora lo usan los dos.
  - **Stripe: el seller grabado gana.** `origin_payment_body.sellerId` le gana al carrito.
    Si difieren, queda un warn.
    - La metadata `sellerId`/`seller_id` del PaymentIntent se compara recién cuando se lee
      el PI (`checkPaymentIntentSeller`), y una diferencia solo se loguea.
  - **Fallback a plataforma, con log.** Si el vendedor no tiene credencial propia, se usa la
    cuenta de plataforma.
    - Queda un `logger.error`, salvo que el vendedor tenga encendido
      `payment_{stripe,klarna}_use_vio_account` (ADR-0028 punto 2).
    - Si ningún checkout es dueño del pago, se usa la plataforma y queda un warn.
- **Tests.**
  - Las pruebas unitarias pasan de 1 suite y 4 tests a 4 suites y 36 tests. Las suites nuevas
    son `payment-seller`, `stripe-connector-seller` y `klarna-connector-seller`.
  - Casos cubiertos:
    - un carrito con seller se reembolsa (Stripe) y se captura (Klarna) con las
      credenciales del seller;
    - un carrito viejo usa `cart.user`;
    - en Stripe gana el seller grabado.
  - Se probó con dos mutaciones: invertir el resolver o quitarle la prioridad al seller
    grabado. En los dos casos fallan 12 tests.
  - `tsc` pasa limpio con `tsconfig.json` y con `tsconfig.build.json`.
- Brief `briefs/payment-processors.md` §5.1 actualizado (commit local en el workspace).

## Decisions

Las tomó el agente; Angelo puede objetarlas.

- **La metadata del PaymentIntent no elige la cuenta, solo se compara.** Para leer el PI hace
  falta la cuenta correcta, y los ids de Stripe son por cuenta. La cuenta que pudo leerlo es
  la que tiene la plata.
- **El fallback a plataforma se mantiene y se loguea, no lanza error.** Los ids de Stripe y
  de Klarna son por cuenta, así que con la cuenta equivocada el PSP responde not found y no
  mueve plata de otro. Si lanzara, se romperían los refunds de pagos viejos que se cobraron
  con la cuenta de Vio antes de que existiera el flag.
- **Se leen las dos claves de metadata** (`sellerId` y `seller_id`). El brief de shopcart
  dice `seller_id`, y la tarea decía `sellerId`. No se verificó en el código de shopcart.

## Blockers / open questions

- **Regenerar `yarn.lock` con un token npm válido** antes del PR.
- **El nombre de la clave del seller** en `origin_payment_body` (`sellerId`, según el journal
  de shopcart) y en la metadata del PI lo tiene que confirmar el agente de shopcart.
- **Refunds de Payment Link pedidos con el `pi_`.** Probablemente no encuentran checkout,
  porque el checkout guarda `plink_…`, y caen a plataforma con un warn. Ya pasaba antes y
  no se corrigió acá. Sale del brief de shopcart y no se verificó.
- **Pagos de la cuenta de Vio cuyo vendedor después cargó credencial propia.** Se buscan en
  su cuenta y Stripe responde not found. La solución sería grabar la cuenta, no solo el
  seller, en la foto. Ya pasaba antes.
- **Vipps** usa solo credenciales de plataforma (`VIPPS_*`). Si una brand cobra Vipps con
  credenciales propias, el capture desde acá falla.
- **Orden de deploy:** la migración de `cart.seller_id` primero. Si no corrió, el SELECT de
  `seller_id` falla, la búsqueda cae al catch y se usa la plataforma con un error.

## Next session

- OK de Angelo para pushear y abrir el PR a develop.
- Regenerar el lockfile.
- Probarlo en QA con un carrito de brand después de la migración y de shopcart.
