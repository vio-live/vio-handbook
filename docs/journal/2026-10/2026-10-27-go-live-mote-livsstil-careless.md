---
date: 2026-10-27
session: "24–27/10: SDK 0.29.0, ADR-0039, go-live de Mote & Livsstil con Careless, dos caídas por nodos de AKS y el lote nocturno que deja los despliegues sin caída"
participants: [angelo, claude, miguel]
status: live
---

# Go-live de Mote & Livsstil × Careless (24–27/10)

Punto de entrada para quien llegue después: qué está en prod, qué falló y qué queda. El detalle de cada pieza está en
los PRs y docs enlazados.

## Goal

Salir en vivo el lunes 26/10 con el artículo de Careless en Mote & Livsstil (Aller, host Replit), con la compra dentro
del artículo (Vipps Express), analítica fiable y reporte diario para el cliente.

## Done

### SDK web 0.29.0 (publicada en npm el 24/10 por Angelo)
- Artículo fantasma (opción B): «Kjøp nå med Vipps» en la ficha solo va directo a Vipps con el carrito vacío; si hay líneas,
  abre el checkout. Apple Pay, igual. vio-web-sdk #98/#99.
- Envío con Vipps Express: el checkout ya no suma nuestra tarifa; muestra «Frakt: Velges i Vipps». vio-web-sdk #100.
- El `purchase` de una vuelta pagada sale al momento (no espera la cola de 5 s) y nuevo `add_payment_info` con `checkout_id`
  al crear el checkout (ADR-0039 punto 3). vio-web-sdk #101.
- Texto para el agente de Replit: `handoff/2026-10-15-replit-y-demo-web-a-commerce.md` § «SDK 0.29.0».
- Vev queda fuera del flujo de releases (Angelo, 24/10).

### ADR-0039 — la compra la confirma Commerce
- [ADR-0039](../../decisions/0039-la-compra-la-confirma-commerce.md). orders #45 (develop) / #46 (master): `order_paid`
  lleva la marca. vio-analytics #33 (`2343c7b`, en staging y prod): compras = `purchase` ∪ `order_paid`, sesión por
  `add_payment_info`, caja en el overview de la marca. webapp #81/#82: tile de cobrado en el panel de la marca.
- vio-analytics #34 (`b7d6ddc`): lecturas por artículo agrupan por `content_id` (el artículo 189 cambió de slug y salía
  duplicado). **Mergeado, sin desplegar**: pendiente de Miguel (canal de coordinación).

### Go-live 26/10
- Artículo: https://www.moteoglivsstil.no/mote/annet/norsksuksesskvinnerfarikkenokavdisseplaggene (slug anterior
  `derforelskernordmenndisseplaggene`, `content_id` 189). Surface 1 «Mote Livsstil Hub», campaña 2 «Careless», channel
  **482** (user 1330 Aller, channel 10), slots `article-189-block-2…12` (11 productos).
- Colección: «Careless Pilot collection» (`927UL4Z6k`, compartida con Aller como `collection_shared` 607) con los 11
  productos marcados en verde en el Excel de Careless. Los channels 480 y 482 tenían conectada por error «Carelles Test»
  (`NnRsYSAaJ`); se cambió por la Pilot.
- Bug encontrado al conectar: `POST /channel/multi-group/v2` devolvía 417 tras guardar (usaba `data.user` en vez de
  `data.user_id`). api #70 (develop) / #71 (master), en prod el 27/10.
- Las copias editables de Aller (`custom_product`) fallaban para 3 tights por un «✔» en la descripción:
  `custom_product.description` era latin1. Migración `ProductDescriptionsUtf8mb41792700000000` (package-database #29,
  kernel 1.0.285), aplicada en QA el 26/10 y en prod el 27/10; las 11 copias ya existen.
- shopcart #105 (develop) / #106 (main): la descripción del pago en Vipps dice producto y talla
  («Vilde genser - Brun · str. M»; «2 varer: …»), con caída al nombre del vendedor si algo falla. Probado contra Vipps MT.

### Caídas de prod
- **26/10 16:15–16:28 UTC** (catálogo 502/503) y **27/10 01:10–01:35 UTC** (02:10–02:35 CET, varios cortes de minutos): actualización de la
  imagen de los nodos de AKS. Detalle y causas en la lección
  [caídas al mover pods](../../lessons/caidas-al-mover-pods-en-aks.md).
- Medidas ya aplicadas: ventana de mantenimiento `aksManagedNodeOSUpgradeSchedule` (martes 02:00–06:00 UTC+1), HPA de
  `istiod` con mínimo 2 (su PDB bloqueaba el vaciado de nodos), y despliegues con `rollout restart` (ver abajo).
- 26/10 por la tarde: el deploy de shopcart #106 dejó el checkout ~83 s caído: el CI hacía `kubectl delete pod` de todos los pods.
- 26/10 por la tarde-noche: el colector de prod (VM Oracle) tuvo timeouts hacia `api.vio.live` durante ~40 min; siguió
  aceptando eventos con la surface en caché (`staleServed`), sin pérdidas. Se recuperó solo.

### Lote nocturno 27/10 04:00–05:50 CET (03:00–04:50 UTC) (autorizado por Angelo)
1. Migración utf8mb4 en prod (1 s, 13 filas).
2. CI sin caída en 13 micros: `kubectl rollout restart` + `rollout status` en lugar de `kubectl delete pod` (PRs
   `ci/despliegue-sin-caida` a develop, validados en QA, y `release/despliegue-sin-caida` a la rama de prod de cada repo).
   campaigns ya desplegaba sin caída. Todos con CI en verde, réplicas completas y catálogo respondiendo en cada paso.
3. api #71 en prod. 4. Copias de Aller 11/11.

### Reportes y avisos
- Reporte diario: página privada actualizada a las 00:04 (tarea programada en la laptop de Angelo,
  `~/vio-reportes/mote-livsstil/generar.py`) y PDF a las 00:01 (`pdf.py`, en noruego, resta las pruebas internas).
  Resumen en Slack `#vio-ordenes` (iqplusworkspace). Gmail del conector sin permiso de envío todavía.
- Datos del día 1 (26/10, PDF con las pruebas internas restadas): 1 344 usuarios (navegadores únicos), 9 310 impresiones,
  366 clics (CTR 3,9 %, 270 usuarios), 7 con carrito, 2 con pago iniciado en Vipps, **0 compras**. 56 % del tráfico desde
  dagbladet.no, 43 % directo/apps, 71 % móvil.
- Análisis de conversión con 5 agentes (UX, contenido, embudo, marketing, técnico):
  [handoff](../../handoff/2026-10-27-mote-livsstil-conversion.md).

## Decisions

- [ADR-0039](../../decisions/0039-la-compra-la-confirma-commerce.md) (24/10).
- [ADR-0040](../../decisions/0040-despliegues-y-mantenimiento-sin-caida.md): ventana de mantenimiento de AKS y despliegues
  con `rollout restart`.
- Los reportes al cliente van en noruego; el desglose por slot es interno (Angelo, 26/10).
- «Usuarios» en el dashboard = sesiones del colector; el reporte usa la misma definición y añade navegadores únicos.

## Blockers

- vio-analytics #34 (`b7d6ddc`) y el borrado de eventos internos (6 `anon_id`, lista en el canal de coordinación) esperan
  a Miguel.
- Gmail del conector de claude.ai sin permiso de envío: el PDF diario llega por la app, no por correo.

## Next session

1. P0 de conversión (handoff): talla XS preseleccionada en la ficha, checkout de 0 kr con carrito vacío, envío visible
   antes de Vipps, barra sticky que tapa las tallas en desktop.
2. Resiliencia: PDB + 2 réplicas en graph-ql/campaigns/shopcart/api/middleware, readiness en graph-ql, que graph-ql no
   muera cuando api no responde (axios sin capturar → `exit 1`), preStop sleep.
3. Careless: comprobar si alguna tight del artículo es el producto en preventa de careless.no
   («Active flared tights m/3 lommer u/s», tag «Kommer snart»); agrupar colores (en su tienda cada color es un producto,
   unidos por el tema con «sibling products», sin app externa).
4. Usuario 1302 (qkoreancosmetics.no, Woo): manda webhooks de pedidos (order.created/updated) pero sus productos no están
   en `imported_product`; todos fallan. Decidir: resincronizar catálogo o quitar el webhook (recibimos datos de clientes).
5. Pendientes menores: el cron `expiredAllInactive` de shopcart falla con `cartsIds` undefined + 417;
   quitar los 7 slots de prueba de Angelo; mensajes para Aller y Careless con las mejoras que les tocan.
