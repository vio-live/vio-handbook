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

**Implementación**, toda en ramas locales `feature/adyen-payment` (kernel:
`feature/adyen-channel-toggle`), **sin pushear** (ADR-0001):

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

- **Credencial de test sin terminar:** la credencial `ws_513405@Company.TipioAS` existe, pero al
  mirarla no tenía API key generada. Los *allowed origins* están en **Client settings**, no en
  "Allowed IP range". Falta dejar las claves en `~/.config/vio/adyen-test.env` y en el blob de QA.
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
