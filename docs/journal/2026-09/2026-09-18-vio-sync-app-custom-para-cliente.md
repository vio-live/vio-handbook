---
date: 2026-09-18
session: vio-sync-app-custom-para-cliente
participants: [angelo, claude]
status: live
---

# Session — 2026-09-18 — onboardear un cliente sin esperar la aprobación del App Store

## Goal

La cuarta submission sigue en review (enviada el 2026-09-10) y hay un cliente que
necesita entrar ya. ¿Se puede, sin tocar la app que está en revisión?

## Done

- **Verificado contra la documentación de Shopify** (no de memoria):
  - El **método de distribución es irreversible**: nuestra app quedó pública, así
    que para el cliente hay que crear **otra app**, con distribución custom.
  - Custom: se instala en **una tienda** con un link que generamos, **sin review**,
    y **no puede cobrar por el sistema de facturación de Shopify** (única
    limitación de la tabla oficial).
  - **Plus solo aplica a instalar la misma app custom en varias tiendas.** Para una
    tienda no hay requisito de plan ni de organización: el app vive en nuestra
    organización de Partner y el cliente instala con el link ("Most apps built for
    a specific merchant or an agency client use custom distribution").
  - Instala el dueño de la tienda o un staff con el permiso **Applications**.
  - **Datos protegidos de clientes**: niveles 1 y 2 "Always available" para apps
    custom; en la pública requieren review (nuestros scopes incluyen `read_orders`).
  - Un **sales channel es una app pública**: el tutorial oficial arranca con
    "Create a public app" y todas se envían a aprobación. Por eso la app del
    cliente no lleva canal.
- **Rama `custom/client-app`** en `vio-live/vio-shopify-sync`, desde `a723307`
  (2026-08-13), el último commit anterior a la conversión a Sales Channel: es la
  versión que estuvo meses en producción, publica productos directo al API de Vio
  y no depende del canal ni del gate de planes (que en una custom llevaría a una
  página de precios inexistente).
- Verificado que ese código sigue sano hoy: typecheck limpio, 168 tests, coverage
  100%, lint y build en verde (hace falta Node ≥ 22.18 para instalar).
- Contrato con el backend de Vio **sin cambios** desde agosto: los endpoints que
  usa esa rama son idénticos a los de master (master solo suma el de planes).
- Añadidos en la rama: `shopify.app.vio-client.toml` (con los TODO de client id y
  URLs) y `docs/CUSTOM-APP.md` con los pasos de punta a punta.

## Decisions

- App custom aparte para el cliente; **la app pública sigue intacta en review** y
  la migración se hará cuando aprueben (desinstalar custom → instalar pública →
  elegir plan).
- La rama **no se mergea a master**: vive en paralelo mientras dure la situación.
- A ese cliente se le factura por fuera de Shopify.

## Blockers / open questions

- Falta el dominio `.myshopify.com` del cliente y las credenciales de la app nueva
  (client id y secret) para completar el toml y el deploy.
- El gate del dashboard le mostrará "Managed through Shopify" sin forma de pagar,
  porque detecta la conexión Shopify. Para un cliente facturado a mano alcanza; si
  se quiere autoservicio, hay que hacer que el gate dependa del plan (codes 5/6/7)
  y no de la sola conexión.

## Next session

- Crear la app custom en el Dev Dashboard, desplegarla en su propio proyecto de
  Vercel desde esta rama, y mandar el link de instalación.
