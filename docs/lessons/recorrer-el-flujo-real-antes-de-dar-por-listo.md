---
title: "Recorrer el flujo real antes de dar por listo un flujo de cobro u onboarding"
last-updated: 2026-09-14
owner: angelo
---

# Recorrer el flujo real antes de dar por listo un flujo de cobro u onboarding

Entre el 2026-09-08 y el 2026-09-14, preparando la cuarta submission de Vio Sync al Shopify
App Store, se dio **tres veces** el mismo patrón: algo declarado "listo", con tests en verde
y hasta verificado por partes, estaba roto de una forma que solo aparecía al recorrer el
flujo completo como el usuario real.

1. **No había cómo cobrar.** Los planes estaban creados en el Partner Dashboard, el listing
   los mostraba y la submission se envió. Cuando Angelo instaló el app para entender el
   flujo, no apareció ningún selector de planes: estaban en "Manual pricing", que es solo
   texto del listing. Nadie podía pagar. Lo destapó él, no nosotros.
2. **La cuenta demo del reviewer veía Stripe.** El gate "Managed through Shopify" se había
   validado en staging **con una cuenta nueva** (que nace con la señal que lo enciende). La
   cuenta demo del listing es vieja y nunca tuvo esa señal: en un navegador limpio, el
   reviewer habría visto precios de Stripe, el mismo 1.2.1 que ya nos había pausado.
3. **Mi propio arreglo tenía una carrera.** El PR que ordenaba "crear antes de borrar" en el
   cambio de plan pasaba 14 tests. Al recorrer el paso 1 de las instrucciones del reviewer
   ("elegí cualquier plan") apareció que la fila nueva dependía de un webhook que no inserta
   si todavía existe la fila vieja: la cuenta podía quedar sin suscripción para siempre.

## Por qué pasó

Los tests unitarios mockean **exactamente la frontera donde esto se rompe**: la
configuración del Partner Dashboard, los datos reales de una cuenta vieja, el orden de
llegada de un webhook. Y la verificación "por partes" (el plan existe, el gate funciona con
una cuenta, el test pasa) no dice nada del recorrido completo con los datos reales.

## La regla

**Ningún flujo de cobro, instalación u onboarding está listo hasta recorrerlo entero como el
usuario real**, con sus datos reales y en un entorno limpio:

- Instalar desde el listing, no desde una URL directa que se salta pasos.
- Usar **la cuenta que va a usar el usuario** (la demo del reviewer, una cuenta vieja), no
  una recién creada que casualmente tiene todo bien.
- Navegador limpio: sin localStorage ni sesiones de otras pruebas.
- Leer la documentación oficial del paso que no se entiende, antes de asumir cómo funciona
  (la de App Pricing decía explícitamente que el app tiene que redirigir).
- Para un arreglo de concurrencia: escribir el orden real de los eventos, incluyendo quién
  escribe cada fila y cuándo, antes de dar el fix por bueno.

Relacionado: [verify-alan-claims-against-code](verify-alan-claims-against-code.md),
[ADR-0017](../decisions/0017-cobro-canal-shopify-via-app-pricing.md).
