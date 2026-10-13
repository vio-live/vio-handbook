---
date: 2026-10-13
session: "api: la brand cobra, pagos de la cuenta, key por channel y una brand por channel (F2.3)"
participants: [angelo, claude, svc-api]
status: live
---

# api — F2.3: la brand cobra, pagos de la cuenta y key por channel

## Goal

Hacer F2.3 del [plan de campañas en Commerce](../../handoff/campanas-en-commerce-plan-de-ejecucion.md)
en vio-api-microservice, según [ADR-0026](../../decisions/0026-brand-publisher-channel-surface.md),
[ADR-0028](../../decisions/0028-orden-fallback-suscripcion-y-corte.md) y
[ADR-0029](../../decisions/0029-corte-por-dns-keys-de-surface-y-nombres.md), sobre el kernel
`@vio-/database` 1.0.269. El coordinador sumó a mitad de camino la exención de suscripción de
los publishers.

## Done

Rama local **`feature/brand-publisher`** desde `origin/develop` (`13ad2ed`), en el worktree
`~/vio-commerce/worktrees/api-brand-publisher`. Tiene 9 commits, **sin push y sin PR**
(ADR-0001), y se le quitó el upstream.

- `63e110d` **Kernel.** Sube los 7 `@vio-/*` a 1.0.269, como hace `kernel-bump.yml`.
  `yarn.lock` no se regeneró (ver Blockers).
- `2b1fb9e` **Tests antes de cambiar.** Caracterizan `getAvailablePaymentMethods` y
  `postUptadeSettings` tal como estaban en develop, que no tenían tests. Dejan escritos dos
  bugs: Walley ignora su encendido y un channel sin settings da TypeError.
- `0ebc9a1` **La brand cobra.**
  - **`brandOfChannel`** (`brand-of-channel.ts`, puro) decide quién cobra:
    - el dueño, si tiene productos propios en el channel;
    - si no, la única brand cuyos productos publica, por las mismas rutas que el backfill del
      kernel;
    - con el channel vacío, o en un channel legacy con varias brands, el dueño, con warn.
  - **`getAvailablePaymentMethods`** lee los encendidos, los flags `UseVioAccount` y las
    credenciales de esa brand:
    - un método con fallback se ofrece solo con credencial propia o con el flag;
    - Qliro y Adyen por la cuenta de Vio piden además la key de plataforma;
    - `markets` sigue saliendo del channel;
    - Walley respeta su encendido;
    - un channel inexistente, o una brand sin fila de settings, devuelve `[]`.
- `994534b` **Compatibilidad con graphql.** `all-by-user-exposed` y `user/v2`
  (`buildChannelInfo`) devuelven los mismos campos de `settings`. Ahora salen de la brand: un
  encendido vale si está prendido y alguien puede cobrarlo.
- `e2c8892` **Pagos de la cuenta:** `GET`/`PUT /paymentmethod/account/:userId`. El contrato
  está en el informe al coordinador y en el brief. El PUT invalida los caches de todos los
  channels a los que llega la cuenta.
- `cab8135` **Settings del channel sin pagos.**
  - Los campos de pago que lleguen se ignoran con un warn.
  - Se arreglaron el TypeError (channel sin settings) y Vipps, que la rama de alta no
    guardaba; ahora se guarda en la cuenta.
  - `markets` deja de doble-codificarse cuando llega como string.
  - Se borró la propagación a `VIO_BACKEND_URL` y su config key.
- `1c61760` **Key por channel.**
  - `createChannelUser` crea una `UserChannelApiKey` nueva por channel. El `apiToken` que
    manda el cliente se ignora.
  - `customApiToken` solo engancha una key del mismo usuario. Si no, responde 400
    `CHANNEL_API_KEY_NOT_OWNED` antes de escribir nada. Esto arregla el bug de seguridad I4.
- `ac246b2` **Una brand por channel.**
  - `createChannelGroup` y `createMultiChannelGroup(V2)` responden 400
    `CHANNEL_NOT_SINGLE_BRAND`, con los `brandIds`, si el channel terminaría con productos de
    más de una brand.
  - Solo se juzga lo que se agrega: un channel legacy mixto sigue andando.
- `da430ce` **Exención de suscripción para publishers.** `shared/account/publisher-exemption.ts`
  salta `validateAction` si la cuenta tiene un `UserRole` activo con
  `RoleId.Publisher` (3), y lo loguea. Se aplica en `createChannelUser` y en request, en
  `createRequest` y en `updateRequest` al aceptar. En api no hay call sites de `sku`.
- **Verificación:**
  - **Tests:** 28 suites y 225 tests. Solo fallan los 3 rojos que ya estaban en develop:
    `vipps-verify`, `klarna-verify` y `stripe-connect-oauth`. Antes eran 19 suites y 141
    tests.
  - **`tsc`:** `tsconfig.build.json` limpio. En `tsconfig.json`, solo los errores de
    `klarna-verify` y `vipps-verify` que ya estaban.
  - **El SQL crudo** (owners del channel, owners de los items, channels que venden una
    cuenta) se corrió contra un MySQL 8.0.21 descartable en Docker, con datos de prueba y el
    mismo formateo de `mysql2`. Dio lo esperado, incluidos los borrados lógicos. El contenedor
    ya se borró.

## Decisions

Las tomó el agente en el código; Angelo puede objetarlas.

- **Lo que ven los clientes:** los `settings` de graphql y de exposed muestran
  "encendido ∧ cobrable", no el encendido crudo. Así un SDK no muestra un botón que shopcart
  no puede cobrar.
- **El `apiToken` de `POST /channel/user` se ignora**, en vez de guardarlo como key. Ese valor
  lo elige el cliente; según el journal del front, es la API credential general del usuario,
  que el middleware resuelve antes como key general.
- **"Una brand por channel" juzga solo lo que se agrega:** un channel legacy con brands A y B
  puede recibir más productos de A o de B, pero no de C.
- **Los métodos de la cuenta van en `paymentMethod`**, que es donde viven las credenciales. El
  SQL de "qué channels venden a una brand" está en `brand-of-channel.ts`.

## Blockers / open questions

- **El token npm de la laptop da 401.** No se pudo correr `yarn install` ni regenerar
  `yarn.lock`. Las pruebas usaron un `node_modules` clonado del worktree de by-shopify-url
  (1.0.267), con `@vio-/database` reemplazado por el contenido del tag `v1.0.269` del kernel.
  El Dockerfile hace `yarn install` sin `--frozen-lockfile`, así que el build resuelve el
  lock, pero hay que regenerarlo antes del PR.
- **No se probó contra QA:** sus migraciones todavía no corrieron (Miguel).
- **Kernel, sin arreglar:**
  - `subscriptions.general.validateAction` nunca frena por el estado de la suscripción:
    `hasActive` y `hasTrial` son async y se usan sin `await`;
  - sus chequeos de `planOptions` son tautologías;
  - un usuario sin fila `user_count_plan` queda rechazado.
- **Pendiente fuera de alcance:**
  - `payment-readiness` (el verify) sigue leyendo los encendidos del channel;
  - `POST /user-channel-api-key` sigue siendo una key por usuario y tipo;
  - `getChannelUserByUserId` (la lista del dashboard) sigue mostrando los encendidos viejos
    del channel.
- **Rendimiento:** `user/v2` y `exposed` suman unas 3 consultas livianas por channel
  (1 de SQL y 2 de la brand). No hay cache.

## Next session

- OK de Angelo para push y PR de `feature/brand-publisher` (ADR-0001), con `yarn.lock`
  regenerado.
- **shopcart (2.4, parte 2):** llenar `cart.seller` con la brand al crear el checkout, y validar
  del lado del servidor el método contra `GET /channel/available-payment-methods`, que ya
  responde por la brand.
- **base-api (2.6):** proxies de `GET`/`PUT /paymentmethod/account/:userId` con el userId de la
  sesión.
- **webapp (2.7):** Settings › Payments contra ese endpoint. Tiene que contemplar el 400
  `CHANNEL_NOT_SINGLE_BRAND` y que el `apiToken` ya no se usa.
