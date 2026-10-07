---
date: 2026-10-07
session: "Review del informe de Alan, y la caza de los 401 de Vipps"
participants: [angelo, claude]
status: live
---

# El informe de Alan contra el código, y por qué todos los avisos de Vipps se rechazaban

## Goal

Angelo pasó el informe de Alan del review de staging en Suecia («Stripe Connect al 100 %»,
«Vipps todo funcionando perfect», «observación: pods de shopcart-reconcile con errores») y pidió
contrastarlo con las tarjetas, el código y los logs. De ahí salió una investigación larga sobre
unos 401 que Vipps recibía en cada entrega.

## Done

### El contraste del informe

Medido contra las tarjetas y el clúster:

- **El barrido**: su observación era correcta. Los fallos eran `curl: (7) Failed to connect to
  shopcart`, el tick que cae mientras el clúster arranca por la mañana o mientras un despliegue
  recicla el pod. La plantilla asumía lo contrario («pauses whenever the cluster is stopped»).
- **Stripe Connect**: 53/71. Las listas de alta, dinero, seguridad y experiencia están completas —
  trabajo sólido. Pero el bloque de **OAuth está 0/10**, que él describe como «unas pequeñas cosas
  relacionado al conectar y desconectar». Su bloqueo es real (no tiene acceso a Vio como company
  en Stripe), el tamaño no.
- **Vipps**: 27/48 y la tarjeta en To do. Sin tocar: **todo el bloque de captura al enviar**
  (F1–F5), las órdenes a Shopify y Woo (E1–E3, que él sí señala), el doble clic (G1) y F10, los
  eventos desde el portal de Vipps.
- Los tres PR de la auditoría siguen **sin revisar** (0 comentarios en su tarjeta).

### Los 401 de Vipps: cuatro sospechas descartadas y una conclusión equivocada

Todas las entregas de Vipps se rechazaban con `signature mismatch`. Se fue descartando con medidas,
y cada descarte dejó herramienta útil:

| Sospecha | Cómo se descartó |
|---|---|
| El relay no manda la firma | El verificador comprueba hash del cuerpo y fecha **antes** que la firma, y los pasa |
| Registros duplicados | `GET /checkout/webhook/vipps` ([shopcart#66](https://github.com/vio-live/vio-shopcart-microservice/pull/66), nuevo) devuelve uno solo |
| El que firma no es el de la fila | El re-registro contestó `reused: true, removed: 0` |
| Host o path distintos | El rechazo ahora dice sobre qué firmó ([#67](https://github.com/vio-live/vio-shopcart-microservice/pull/67)): host y path eran exactamente los registrados |
| Secreto cifrado sin clave, o una máscara guardada | `unusableSecretReason` ([#68](https://github.com/vio-live/vio-shopcart-microservice/pull/68)) no dijo nada: el valor era normal |

Con todo descartado se añadió `force` al registro ([#69](https://github.com/vio-live/vio-shopcart-microservice/pull/69))
para rotar el secreto, y **ahí apareció la verdad**, en el error de ese intento:

```
417  Vipps: seller 1322 pays through Vio's partner keys; that registration covers it
```

La fila de Bohus había pasado a **modo partner con la MSN 545865** — la unidad nueva que Miguel
cargó el 06/10 ([su entrada](2026-10-06.md)). Los eventos que se rechazaban eran reintentos de la
unidad **vieja, 358493**, que ya no tiene fila: para esa MSN no hay secreto, Vipps insiste siete
días, y nada de eso correspondía ya a nadie.

**Y en medio de esto cometí un error de método**, que es la lección del día: comprobé las variables
con `printenv` dentro del pod y concluí que faltaban `PAYMENT_SECRETS_KEY`, `VIPPS_WEBHOOK_SECRET`
y las claves de Vipps. La app **no lee el entorno del proceso**: lee un `.env` horneado en la
imagen. Mirando el fichero de verdad, `VIPPS_WEBHOOK_SECRET` sí estaba (la puso Miguel) y
`PAYMENT_SECRETS_KEY` no. Sobre la conclusión falsa llegué a escribir en la tarjeta de Alan que
«los avisos llegan sin autenticar»; está corregido ahí. Lección aparte:
[`printenv no es la configuración del servicio`](../../lessons/printenv-no-es-la-configuracion-del-servicio.md).

Comprobación final, ya con el fichero correcto: una sonda contra el endpoint público con un evento
de la unidad 545865 y firma inventada responde 401 y registra `with 1 secret(s)` — o sea, **el
secreto de plataforma se usa y la verificación funciona**.

### Lo que sí quedó arreglado hoy

- **El ruido del barrido** ([#73](https://github.com/vio-live/vio-shopcart-microservice/pull/73)):
  un `GET` que Vipps contesta con 404 pasa a aviso (eran 20 ERROR en 100 minutos por dos
  referencias que Vipps no conoce, repitiéndose los siete días de la ventana), y el CronJob espera
  a shopcart en vez de fallar el tick (`--retry` acotado). Un servicio caído de verdad sigue
  fallando el Job.
- De ayer, ya en QA: el IVA ×100 de Walley, el `unreadable` del barrido, la cadena del estado 4xx
  ([base-api#28](https://github.com/vio-live/vio-base-api/pull/28) +
  [shopcart#60](https://github.com/vio-live/vio-shopcart-microservice/pull/60) +
  [graphql#19](https://github.com/vio-live/graphql/pull/19)) y el 404 del checkout inexistente.

## Decisions

- **No registrar el webhook de partner «a ver qué pasa».** Vipps entrega el secreto una sola vez:
  un registro que se queda sin su secreto firma eventos que nadie puede verificar y Vipps los
  reintenta siete días. Se registra cuando quien lo lanza puede guardar el secreto en el blob en la
  misma pasada. Es tarea de infraestructura, y en QA no bloquea nada.
- **El 404 de un pago que el PSP no conoce no es un error nuestro.** Mismo criterio que con el
  «No such payment_intent» de Stripe: lo que no podemos arreglar no debe parecer una avería.
- **El barrido espera, no falla.** Es idempotente; un tick que cae durante un despliegue no es una
  incidencia.

## Blockers

- **`PAYMENT_SECRETS_KEY` sigue sin estar** en el `.env` de QA (comprobado en el fichero, 0
  líneas). Mientras tanto las credenciales de pago de todos los vendedores están en claro en la
  base. Paquete de instrucciones entregado a Angelo para Miguel.
- **Hay una discrepancia que conviene cerrar**: el registro vivo hoy en la unidad 545865 es
  `37ffd54b-c8a7-46fa-be80-e35be4cab767`, y el que Miguel registró y cuyo secreto puso en el blob
  es `7790aa7d-1236-4cf2-a886-e3731dd8ebd1`. Solo hay uno registrado. Si el secreto del blob es el
  del 7790aa7d, los eventos reales de 545865 se rechazarán. **Se resuelve con un pago de prueba**:
  o verifica en silencio, o sale la línea de rechazo con host, path y número de secretos.
- Alan: sin acceso a Vio como company en Stripe, el bloque de OAuth (10 puntos) no avanza.

## Next session

- El pago de prueba en 545865 para cerrar la discrepancia del registro.
- Miguel: `PAYMENT_SECRETS_KEY` + `reencrypt-all`; el secreto de partner cuando toque producción.
- Alan: revisar los tres PR de la auditoría, y decir si pedimos el acceso a Stripe.
