---
title: "0026 — Modelo de cuentas en Commerce: brand, publisher, channel y surface"
date: 2026-10-13
status: accepted
owner: angelo
deciders: [angelo]
supersedes-in-part: "0025 (punto 4: una sola key por surface)"
---

# 0026 — Modelo de cuentas en Commerce: brand, publisher, channel y surface

## Context

[ADR-0025](./0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md) decidió reconstruir
campañas y surfaces dentro de Commerce. Antes de diseñar las tablas había que fijar quién es
dueño de qué. El inventario del 2026-10-13, hecho con un agente por servicio y en solo
lectura sobre `develop` y `master`, mostró esto:

- **Las credenciales de pago ya son de la cuenta.** Viven en `payment_method.user_id`, y
  shopcart, payment-processors y api resuelven por usuario. Lo único que está por channel
  son 11 encendidos de método en `channel_user_settings`, más `markets`,
  `purchaseConditions` y `orderConfirmationEmail`.
- **"Channel" mezcla tres cosas.** Una es la tienda de un reseller (Shopify, Woo, Magento,
  con export de catálogo). Otra es un tipo de integración (Vev, WordPress, Vio SDK, API
  Custom, GraphQL), que en la práctica se pisa con las plataformas de una surface. La
  tercera es el grupo de productos curado (`ChannelGroup`, `ChannelUserProducts` con su
  `referralFee`).
- **La key de channel es una por usuario y tipo de channel**
  (`api userChannelApiKey.service.ts:25-41`). Dos channels del mismo tipo comparten key, y
  por eso la key no identifica al channel.
- **shopcart cobra con las credenciales del dueño del channel** (`cart.user`, y en
  varios caminos con el `userId` que manda el cliente). Además las órdenes se guardan con
  `channel: 'Partner'` fijo y sin `channelUserId`.
- **Shopify, Woo y Magento cumplen dos roles.** Uno es la tienda de salida de un reseller.
  El otro es el origen del catálogo de la brand, que es lo que usa vio-sync (vio-sync no
  crea channels).

## Decision

1. **Hay dos tipos de cuenta: Brand y Publisher.**
   - **Brand** es el business o supplier.
   - **Publisher** es el nombre nuevo del tipo de cuenta que hoy se registra como
     "Channel" (claim `channel`).
   - El tipo se guarda en la base (`UserRole`), no solo como claim de Firebase.
2. **La brand tiene:**
   - **Catálogo:** se carga a mano o se importa desde Shopify, Woo, Magento o Squarespace.
     El rol de origen de catálogo se queda.
   - **Pagos:** las credenciales siguen en `payment_method` y no se mueven. Los
     encendidos por método pasan de `channel_user_settings` a `UserSettings`. Al migrar,
     se toma la unión de los channels activos y se listan los conflictos.
   - **Markets:** a dónde envía.
   - **Su marca:** logo y colores.
   - **Vende la brand:** cobra con su propia configuración y la plata es suya.
3. **El publisher tiene:**
   - **Acceso a catálogos:** lo obtiene por **Connection**, que es el flujo
     reseller ↔ supplier que ya existe.
   - **Channels:** cada channel es un **grupo de productos** de una o varias brands. **No
     tiene tipo** y tiene **su propia API key**.
   - **Surfaces:** cada una tiene **API key general**, plataformas con sus
     particularidades por tipo (iOS, Android, TV, Vev, web, custom web) y sus slots, y los
     markets donde se muestra. El publisher les **asigna channels (1..N)**.
   - **Campañas:** viven en una surface y tienen sponsor (una brand) y parámetros. Sus
     productos salen de un channel asignado a esa surface.
4. **En el checkout, cada carrito cobra con la brand de sus productos**, no con el dueño
   del channel. Ya es un carrito por sponsor, según
   [ADR-0006](./0006-storage-is-always-multi-sponsor-cart.md). La orden registra al
   publisher (el channel), a la brand (el supplier) y la surface y campaña.
5. **El SDK usa la key general de la surface y las keys de sus channels.**
   `/v2/mobile/config` mantiene su forma y entrega las keys de channel a partir del vínculo
   surface ↔ channel, en vez de leerlas pegadas a mano en el sponsor. Esto reemplaza el
   punto 4 de ADR-0025 (una sola key).
6. **Se vende donde coinciden los markets de la brand y los de la surface.**
7. **Shopify, Woo y Magento dejan de ser channels.** Se retira el rol de tienda de reseller
   y se queda el de origen de catálogo.
8. **Vocabulario:** Brand, Publisher, Surface, Channel (el grupo de productos del
   publisher) y Campaign. "Surface" no se usa para nada de Commerce y "channel" no se usa
   para outlets.

## Consequences

- **shopcart:** el vendedor de cada carrito pasa a ser la brand de los productos. Eso
  necesita una sola función de resolución, en vez de las cuatro fuentes de hoy, que además
  dejan elegir al cliente. Los `orders/save` tienen que mandar el channel. Y hay que validar
  del lado del servidor que el método esté encendido.
- **package-database:**
  - columnas de encendidos en `UserSettings`, más el backfill;
  - una key por channel (FK propia en vez de una por usuario y tipo);
  - las tablas nuevas de surface y campaña (ADR-0025);
  - más tarde, el drop de los tipos de channel y de las FKs de tienda de reseller.
  Se libera como siempre, con los 7 paquetes juntos.
- **middleware:** la matriz de rutas por tipo de channel se rehace. Al retirar los tipos
  2/5/11, las keys que les quedaran recibirían 401.
- **api:**
  - los encendidos se leen de la brand de cada producto;
  - el endpoint de settings del channel deja de tener pagos;
  - el channel se crea sin tipo y con su propia key;
  - se borra la propagación a vio-backend.
- **webapp:**
  - Settings › Payments gana los encendidos;
  - el channel muestra lo heredado en solo lectura;
  - Channels pasa a ser "grupos de productos" del publisher;
  - aparecen las pantallas de Surfaces y Campañas.
- **Migración de casos vivos:** hoy hay channels que son de brands (Lyko, con su key pegada
  en el sponsor de VG, y Aller). Para cada uno, el publisher se conecta al catálogo, arma su
  channel y lo asigna a su surface. Después, el channel de la brand se retira.

## Alternatives considered

- **Channel de la brand.** Cada brand arma sus channels y la surface los usa. Se descartó
  porque es el publisher quien cura productos de varias brands para cada surface.
- **Una sola key por surface** (lo que decía ADR-0025). Se deja para más adelante. Por
  ahora la key general más las keys de channel mantienen el contrato actual de los SDKs.
- **Markets en un solo lado.** No alcanza: la brand decide a dónde envía y la surface decide
  dónde se muestra.
