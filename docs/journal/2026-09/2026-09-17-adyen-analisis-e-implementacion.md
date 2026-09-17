---
date: 2026-09-17
session: "Adyen: lectura de la documentación, plan, decisiones e implementación en ramas"
participants: [angelo, claude]
status: live
---

# Adyen como quinto proveedor de pago: del análisis a las ramas

## Goal

Pedido de Angelo: implementar **Adyen** "así como con Qliro y Nexi", leyendo la documentación a
fondo y planificando para no repetir los errores de los anteriores. Requisitos: que sirva para
todos los clientes aunque se empiece por Vev y el web SDK; buenas prácticas; que la orden vuelva
al ecommerce del cliente (webhook o algo mejor), con productos de Google feed; que el dinero vaya
directo a la cuenta del cliente; pensar el formato de la orden y la metadata; credenciales por
defecto por entorno que el cliente puede reemplazar por las suyas; ver si el envío se puede elegir
dentro de Adyen; Vipps, tarjeta y lo relevante para Noruega y Suecia; y contemplar los markets.

## Done

**Lectura.** Siete lecturas en paralelo (cinco de la documentación de Adyen por áreas, dos
mapeando cómo se implementó Nexi en backend y en el SDK) más lectura propia de las páginas que
deciden el diseño. La herramienta de lectura web resumía mal `docs.adyen.com`; se leyó el Markdown
crudo y los OpenAPI ([lección](../../lessons/leer-la-doc-del-psp-cruda.md)). El Customer Area de
test (`TipioAS` → `TipioASECOM`) se miró en sólo lectura: sin credenciales ni webhooks, con Vipps,
Swish, Klarna, Trustly, MobilePay y tarjetas ya habilitados.

**Lo que cambió el plan respecto de "otro Nexi":** Adyen es una capa de pago, no un checkout
embebido. No pide email, dirección ni envío; su webhook es de la cuenta, no del pago; y su client
key sólo funciona en los *allowed origins* registrados. Todo en
[`architecture/adyen.md`](../../architecture/adyen.md).

**Respuestas a lo que Angelo preguntaba:**
- *Envío dentro de Adyen:* no existe, salvo en Apple Pay / Google Pay / PayPal express. Vipps
  Express no está soportado vía Adyen. Se usa el selector de Vio y el importe llega cerrado.
- *La orden de vuelta al ecommerce:* Adyen **nunca devuelve las líneas**. El seller puede añadir
  su propio segundo webhook en su Adyen (pago, comprador, direcciones, `metadata.vio_*`); las
  líneas le llegan por nuestro `order.paid`.
- *Dinero directo:* con su API key, el pago cae en su merchant account y lo ve en su Customer
  Area con nuestra referencia, las líneas con **su** `g:id`/SKU y la metadata.

**Implementación**, en ramas `feature/adyen-payment` (kernel: `feature/adyen-channel-toggle`).
Al cierre del análisis estaban sin pushear; por la tarde se abrieron los PRs y empezó el
despliegue a QA (ver *Rollout a QA* más abajo):

| Repo | Commit | Qué |
|---|---|---|
| package-database | `978df71` | `channel_user_settings.adyen` + migración `1789643151000` |
| vio-shopcart-microservice | `e3571df` | conector (API v72, seller → plataforma), servicio (sesión = foto), helpers puros (importes, HMAC, market, saneador v72), `initPaymentAdyen`, webhook, orden idempotente con lock, confirmación al pagar, sweep. 73 tests |
| vio-base-api | `13d37f0` | relay `POST /adyen/webhooks/:ref/:token` (corta a 9 s, nunca loguea el cuerpo) |
| graphql | `3e31de5` | `CreatePaymentAdyen`, `ConfirmAdyenPayment`, `GetAdyenPayment`; DI verificada en runtime |
| vio-api-microservice | `6eb96c2` | secretos, verify con causa, `webhookToken` gestionado por el servidor, gate con market, `adyen` en los **tres** sitios de `postUptadeSettings`. 16 tests |
| webapp-vio-commerce | `069dc73` | proveedor Adyen (sin interruptor de sandbox), switch del canal, bloque con la URL del webhook. 6 tests |
| vio-web-sdk | `af17cbf` | **0.13.0**: `payments/adyen.ts` (Adyen Web 6.45.0 por CDN + SRI), montaje a petición, sesión descartada ante cambios, retorno finalizado en servidor. 43 tests |
| vio-vev | `f64c555` | rebundle 0.13.0 (531 → 540 KB), guard del bundle pasado. **Sin `vev deploy`** |

Verificado en local: shopcart 220 tests + `tsc` limpio; graphql `tsc` limpio, contenedor DI y
schema construidos; api con `tools/typecheck-service.sh` (sin errores nuevos) y sus tests; webapp
270 tests + eslint; SDK 209 tests, `tsc` y build. Los guards críticos se comprobaron **por
mutación** (los tests fallan al quitarlos): importe del webhook, fallback silencioso, montaje sin
pedirlo, detección de cambios, limpieza de la URL de retorno. Un test destapó un bug real antes
de salir: el tope de 1024 caracteres del `returnUrl` no se aplicaba en `localhost`.

**Nada de esto se probó contra Adyen.** Queda `~/vio-commerce/tools/adyen-spike/spike.mjs`:
comprueba la credencial, lista los métodos para NO/NOK, prueba `payable:false` y levanta una
página local con el Drop-in real. Lee `~/.config/vio/adyen-test.env`; la API key nunca se imprime.

## Rollout a QA (tarde del 17/09)

Angelo: *"te paso las credenciales y ya tiras tú; lo deployamos y seguimos desde ahí"* — OK
acotado a `develop`/QA ([ADR-0015](../../decisions/0015-merge-delegado-con-ok-explicito.md)).

| PR | Estado | Verificado después |
|---|---|---|
| [package-database#16](https://github.com/vio-live/package-database/pull/16) | mergeado `eaf4aebd` | el release publicó **sólo `@vio-/database` 1.0.266** y **paró en el gate de migración** (sin bump a los micros), como está diseñado |
| [shopcart#31](https://github.com/vio-live/vio-shopcart-microservice/pull/31) | mergeado `6fa4e4e9` | pod 2/2, 0 reinicios, Nest arranca, las 4 rutas de Adyen mapeadas, sin errores en el log |
| [base-api#11](https://github.com/vio-live/vio-base-api/pull/11) | mergeado `1a7d78f0` | `POST /adyen/webhooks/platform/<token malo>` → **401** de punta a punta (base-api → shopcart) en 0,2 s |
| [graphql#12](https://github.com/vio-live/graphql/pull/12) | mergeado `2228b175` | DI resuelta en runtime antes del merge; los 3 campos de Adyen validan contra el schema desplegado; la página real `a-vio-dev.vev.site/bohus-demo` sigue cargando su carrito |
| [api#22](https://github.com/vio-live/vio-api-microservice/pull/22) | **abierto** | necesita el kernel con la columna: va **después** de la migración y del `pkg=all` |
| [webapp#29](https://github.com/vio-live/webapp-vio-commerce/pull/29) | **abierto** | después de api |
| [vio-web-sdk#61](https://github.com/vio-live/vio-web-sdk/pull/61), [vev#41](https://github.com/vio-live/vev/pull/41) | **abiertos** | base `main`: los mergea Angelo o con su OK explícito; después `vev deploy` |

Sin las `ADYEN_*` en el entorno, Adyen queda **dormido**: el `ConfigService` devuelve
`undefined`, no hay validación al arrancar y el gate no lo ofrece.

> ⚠️ **Ventana de riesgo hasta que corra la migración.** `package-database` `develop` ya declara
> `channel_user_settings.adyen`. Un push a `develop` de **cualquier** `package-*` dispararía un
> release que ya no ve la migración en su diff, haría el bump de los 11 micros y QA daría
> `Unknown column 'adyen'`. **No relanzar el kernel hasta correr**
> `DB_MIGRATION_FILE=1789643151000-adyen-channel-toggle.ts yarn migration:execute` en
> `vio-ecom-db-staging`/`outshifter`. Después: `gh workflow run kernel-release.yml -f pkg=all`
> ([lección](../../lessons/release-parcial-del-kernel.md)).

**Defecto propio atrapado antes del merge** (shopcart `8f96bbf`): dos regex que limpian
caracteres de control llevaban los **bytes crudos** (NUL, 0x1F, 0x7F) en vez de los escapes, y
git trataba `adyen-amounts.ts` y `adyen-sanitize.ts` como binarios: el PR no mostraba su diff.
Mismo comportamiento, ahora revisable, con un test que falla si vuelven los bytes crudos.

**Credencial de test:** las claves que Angelo dejó en el archivo local tienen buena forma pero
Adyen TEST responde **401** en Checkout y en Management. Mirando el Customer Area (sólo
lectura): ninguna de las dos credenciales (`ws_513405`, `ws_413265`) tiene client key ni
allowed origins guardados → la página no llegó a guardarse (Adyen exige al menos un origin para
guardar una client key). Origins: `https://*.vev.site`, `https://vio-demo.vercel.app`,
`http://localhost:5173`, `http://localhost:5174`.

**Hallazgos de paso:**
- **Nada llama a `POST /checkout/payments/reconcile`**: no hay CronJob en QA ni ningún llamador
  en la org. El barrido que cubre los avisos perdidos de Kustom, Qliro, Walley, Nexi y ahora
  Adyen no corre. `payments.md` lo da por hecho ("scheduler externo ~10 min").
- Tras el encendido de las 08:00, 4 pods (`api`, `payment-processors`, `templates`, `users`)
  llevan 14 h en `PodInitializing` en el nodo `vmss000004`; cada uno tiene un hermano sano.
- El cluster de QA se recreó: el kubeconfig viejo no resolvía. `az aks get-credentials -g qa -n
  kubernetesqa --overwrite-existing`.

## Decisions

- [ADR-0019](../../decisions/0019-adyen-sesiones-form-first.md): Sessions flow, formulario propio
  primero, sesión inmutable, orden desde el webhook verificada contra la foto, entorno derivado de
  la client key.
- **Angelo:** la cuenta por defecto cobra para **cualquier seller sin claves**, como Qliro.
  Excepción explícita a la regla "sin fallback para proveedores nuevos" que quedó con Nexi.
- **Angelo:** **sólo Noruega por ahora**; "contemplar los markets" es que Adyen respete la
  limitación por market que el graph y Vio ya tienen, no un concepto nuevo ni traducir el SDK.
- **Angelo:** hay un **cliente con cuenta de Adyen propia** → se prioriza el "conecta tu Adyen".
- **Angelo** crea la credencial de test; los secretos no pasan por el agente.

## Blockers

- **Migración de `adyen` en QA sin correr** (la corre Angelo o Miguel): bloquea el `pkg=all`, el
  bump de los micros, api#22 y webapp#29.
- **Credencial de test sin guardar en Adyen** (401): ver *Rollout a QA*. Los *allowed origins*
  están en **Client settings**, no en "Allowed IP range".
- **`ADYEN_*` en el `.env.local` compartido de QA**: pendiente del OK de Angelo (se hornea en el
  build: después hay que reconstruir shopcart y api).
- **El webhook no se crea hasta desplegar el relay**: antes, Adyen marca el endpoint como
  *Failing* y encola.
- Dos contradicciones de la documentación por probar en TEST: `payable` en `POST /sessions`, y
  express de Apple/Google Pay en el Sessions flow.
- Riesgo abierto: el Drop-in es DOM real en **light DOM**, expuesto al CSS de la página del
  publisher. Shadow DOM no aparece en ninguna parte de la documentación de Adyen.
- Las tres copias de `payment-secrets.ts` siguen divergiendo: payment-processors no tiene `Nexi`
  ni `Adyen` (no lo usa ninguno de los dos).
- El token npm de la laptop sigue caducado: api no se puede instalar en local.

## Next session

1. Angelo: generar API key y client key, añadir los origins (`https://*.vev.site`,
   `http://localhost:5173`, `http://localhost:5174`), dejar el archivo local → correr el spike.
2. OK de Angelo para pushear y abrir PRs. Orden: kernel (release `pkg=all`, migración a mano en
   QA) → shopcart → base-api → graphql → api → webapp → SDK → Vev.
3. `ADYEN_*` en el `.env` compartido de QA; después, el webhook en `TipioAS`.
4. E2E en QA recorriendo el flujo real: tarjeta, 3DS challenge, Vipps (app de test), Klarna,
   rechazo, doble click, dos pestañas, cambio de envío con el Drop-in montado, webhook caído.
5. Auto-configuración por Management API; captura/refund/cancel; `order.paid` con reintentos.
6. Al mergear: actualizar `~/vio-commerce/briefs/{shopcart,api,graphql,base-api,front-dashboard}.md` y pasar `architecture/adyen.md` de `draft` a `live`.
