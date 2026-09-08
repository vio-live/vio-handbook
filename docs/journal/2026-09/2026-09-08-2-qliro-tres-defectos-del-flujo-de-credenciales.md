---
date: 2026-09-08
session: "Qliro — por qué el E2E manual de Alan no pasó de la primera pantalla"
participants: [angelo, claude]
status: live
---

# Qliro: tres defectos entre el formulario y el backend

**Objetivo.** Alan reportó tres cosas de su E2E manual ([QYJRBZ5D](https://trello.com/c/QYJRBZ5D)):
guardar credenciales daba error, Qliro no aparecía en `GetAvailablePaymentMethods`, y el
iframe nunca dejó pagar. Angelo pidió reproducirlo.

Los tres eran reales, y los tres estaban **entre** el formulario y el backend: cada mitad
correcta por su cuenta, incompatibles juntas. Las escribí yo las dos.

## Antes de nada: el entorno estaba apagado

`kubernetesqa` se apagó a las 23:00 del 2026-09-07 (job de ahorro de coste, acordado) y
seguía apagado. Con el clúster caído los tres síntomas se producen igual, así que la
primera media hora se fue en descartar eso. **Es la primera pregunta ante cualquier
reporte de QA: ¿a qué hora probaste?**

Angelo lo encendió y a partir de ahí se pudo medir.

## 1. El sondeo de credenciales va a producción salvo que Sandbox esté encendido

Síntoma: `{status: "invalid", detail: "PSP rejected the credentials (401)"}` con las
credenciales de test que funcionan en todos lados.

Medido con las mismas claves:

| Host | Respuesta | Qué hacía el formulario |
|---|---|---|
| `pago.qit.nu` (Sandbox sí) | **404** | válido → guardaba |
| `payments.qit.nu` (Sandbox no) | **401** | inválido → **bloqueaba** |

El toggle Sandbox arranca **apagado** (`default: false`), así que el camino natural —abrir
el diálogo, pegar claves de test, guardar— falla siempre. Y el mensaje era literal pero
inútil: apunta a las claves cuando lo que está mal es el entorno.

**Decisión (Angelo):** arreglar el mensaje, no el default. Alguien configurando un seller
real en producción podría dejarse el toggle puesto sin darse cuenta.

## 2. La Terms URL: opcional en el formulario, obligatoria en el backend

La cadena:

1. El seller guarda **sus propias** credenciales sin Terms URL — el formulario lo permitía.
2. `getConfig` encuentra clave y secreto, así que **deja de usar la configuración de
   plataforma por completo**: ese fallback sólo salta si falta una de las dos.
3. `createPayment` llamaba a `requireTermsUrl` → **lanzaba**.
4. Sin pedido no hay `html_snippet`. **El checkout no renderiza y el navegador no dice por qué.**

El E2E automático nunca lo detectó porque siempre corrió por plataforma, que toma la Terms
URL del entorno. El defecto sólo existe en el instante en que un seller trae lo suyo — el
paso 3 de la tarjeta de Alan.

**Decisión (Angelo):** que no rompa, que use el fallback. Implementado sin tocar las
credenciales del seller: el dinero sigue liquidando en su cuenta, sólo se rellena el campo
que falta, y se avisa a nivel WARN porque el comprador ve términos ajenos.

## 3. Qliro figuraba como proveedor sin fallback

`fallback: false` en el dashboard, cuando tiene fallback de plataforma desde el 2026-09-04.
La fila decía **"Not available"** para un método que sí cobra. Por eso el flujo no se
entendía: la pantalla afirmaba lo contrario de lo que hace el backend.

De paso, `StatusBadge` **no tenía variante `positive`**: como hace
`VARIANTS[variant] || VARIANTS.neutral`, "Connected" caía en silencio al mismo gris que
"Not available". Tres pantallas la pedían y ninguna la tenía (pagos, REST, colecciones).

## Lo que queda escrito

El flujo de credenciales, que Angelo articuló y no estaba en ningún sitio:
[`architecture/payments.md`](../../architecture/payments.md#el-flujo-de-credenciales-de-qliro-en-orden).
De entrada la cuenta de test de Vio; luego las de test del seller; luego las de producción
del seller; y más adelante las nuestras de producción para quien prefiera cobrar con
nuestra cuenta.

## PRs

| Repo | PR |
|---|---|
| shopcart | [#19](https://github.com/vio-live/vio-shopcart-microservice/pull/19) — fallback de Terms URL |
| webapp | [#10](https://github.com/vio-live/webapp-vio-commerce/pull/10) — Terms URL obligatoria · [#11](https://github.com/vio-live/webapp-vio-commerce/pull/11) — mensaje de entorno, badge verde, flujo |

## Siguiente

- Angelo sigue probando el flujo en Vev.
- El punto 1 de Alan queda explicado por el toggle Sandbox, pero **falta confirmarlo con
  él**: si probó con el clúster apagado, los tres síntomas tienen otra explicación más
  simple y estos arreglos siguen siendo válidos igual.
