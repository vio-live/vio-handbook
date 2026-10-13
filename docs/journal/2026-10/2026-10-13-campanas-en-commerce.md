---
date: 2026-10-13
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-10-13 — campañas y surfaces a Commerce

## Goal

Hacer el audit de vio-backend, rescatar lo que se usa ("hacer campañas, registrar surfaces y
poco más"), decidir dónde va dentro de Commerce y definir el modelo antes de tocar código.

## Done

- **Audit de vio-backend y de Commerce**, con 11 agentes en solo lectura (uno por servicio,
  más vio-backend, consumidores y front). Resultado en
  [campanas-y-surfaces-en-commerce](../../architecture/campanas-y-surfaces-en-commerce.md).
  Lo principal:
  - De vio-backend solo tiene uso real `GET /v2/mobile/config`, en staging (VG en Vev y la
    web de Aller).
  - Las credenciales de pago **ya son por cuenta** (`payment_method.user_id`). Lo único que
    está por channel son 11 encendidos.
  - vio-sync no crea channels: es origen de catálogo.
- **Decisiones** en ADR-0025, ADR-0026 y ADR-0027 (ver abajo).
- **Plan de ejecución:**
  [campanas-en-commerce-plan-de-ejecucion](../../handoff/campanas-en-commerce-plan-de-ejecucion.md),
  en revisión por Miguel y un agente revisor.
- **Bugs encontrados en prod** (verificados en código):
  - **`users disconnectShopifySalesChannel`:** hace `softDelete(userId)`, que borra la
    conexión Shopify cuyo id coincide con el userId. vio-sync lo llama al desconectar.
  - **`GET /api/channel/user/admin/by-shopify-url`:** no tiene auth y devuelve tokens de
    Shopify.
  - **Otros endpoints sin auth en base-api:** `GET /klarna/order/:id` (PII),
    `/shopify/bulk-credentials`, `/shopify/migrate/suppliers/ecom-user` y tres rutas de
    Magento.
  - **shopcart deja que el cliente elija con qué cuenta se cobra:** `userId` del body o del
    path en Stripe, Apple Pay y Google Pay.
  - **Hay una API key de Commerce escrita en el código** de VioSwiftSDK y VioKotlinSDK
    (`DynamicComponentsService`).
  - **vio-backend:** fuga entre surfaces en `/v2/mobile/campaigns/:id/components`,
    `GET /api/campaigns/:id` público y `PUT` de configs que escriben en campañas ajenas.
  - **`validateAction` (package-service) no frena por el estado de la suscripción:**
    `hasActive` es async y se usa sin await.

## Decisions

- [ADR-0025](../../decisions/0025-campanas-y-surfaces-se-reconstruyen-en-commerce.md):
  - campañas y surfaces se reconstruyen en `vio-campaigns-microservice`;
  - se retira todo lo que no se usa, incluido el `Campaign`/`Component` de liveshow;
  - se avanza por tipo de surface.
- [ADR-0026](../../decisions/0026-brand-publisher-channel-surface.md):
  - **Brand:** catálogo, pagos (los encendidos van a `UserSettings` con backfill por
    unión) y markets.
  - **Publisher** (es el nombre nuevo de la cuenta "Channel"): channels = grupos de
    productos con key propia, surfaces con key general, y campañas.
  - **Checkout:** cobra la brand.
  - Shopify, Woo y Magento dejan de ser channels.
- [ADR-0027](../../decisions/0027-servicio-de-campanas-contrato-y-slots.md):
  - **Contrato:** mismas rutas en `api.vio.live`, con `/v2/mobile/config` compatible más
    `campaigns[]`.
  - **Una brand por channel**, por ahora.
  - **Campañas simultáneas repartidas por slots livianos.**
  - **Plataformas:** web (snippet), custom web, Vev, apps y TV.

## Mediciones pendientes (solo lectura; las corre Angelo en la MySQL de QA y prod)

```sql
-- 1. Conflictos de la unión (corregida tras la revisión: LEFT JOIN para incluir channels
--    sin fila de settings, que hoy ofrecen todo por defecto, e IFNULL para no perder NULLs)
SELECT cu.user_id, COUNT(*) AS channels,
       COUNT(DISTINCT CONCAT(
         IFNULL(s.stripe_payment_intent,'n'), IFNULL(s.stripe_payment_link,'n'), IFNULL(s.klarna,'n'),
         IFNULL(s.vipps,'n'), IFNULL(s.kustom,'n'), IFNULL(s.qliro,'n'), IFNULL(s.walley,'n'),
         IFNULL(s.nexi,'n'), IFNULL(s.adyen,'n'), IFNULL(s.google_pay,'n'), IFNULL(s.apple_pay,'n'),
         IF(s.id IS NULL, '-sin-settings', ''))) AS variantes
FROM channel_user cu
LEFT JOIN channel_user_settings s ON s.id = cu.channel_user_settings_id
WHERE cu.deleted_at IS NULL AND cu.active = 1
GROUP BY cu.user_id HAVING variantes > 1;

-- 2. Channels de tienda vivos, sus API keys y órdenes de los últimos 90 días
SELECT channel_id, COUNT(*) AS total, SUM(active = 1) AS activos
FROM channel_user WHERE deleted_at IS NULL AND channel_id IN (2,5,11) GROUP BY channel_id;
SELECT channel_id, COUNT(*) AS keys_vivas
FROM user_channel_api_key WHERE deleted_at IS NULL AND channel_id IN (2,5,11) GROUP BY channel_id;
SELECT channel, COUNT(*) AS ordenes, MAX(created_at) AS ultima
FROM `order` WHERE UPPER(channel) IN ('SHOPIFY','WOOCOMMERCE','MAGENTO')
  AND created_at > NOW() - INTERVAL 90 DAY GROUP BY channel;

-- 3. Conexiones Shopify de reseller con token (expuestas por by-shopify-url)
SELECT COUNT(*) AS expuestas
FROM channel_user cu JOIN shopify_connection sc ON sc.id = cu.shopify_connection_id
WHERE cu.deleted_at IS NULL AND sc.deleted_at IS NULL AND sc.access_token IS NOT NULL;

-- 4. Candidatas a víctima del softDelete(userId) (revisar a mano: también salen borrados legítimos)
SELECT sc.id, sc.supplier_id, sc.deleted_at
FROM shopify_connection sc
JOIN `user` u ON u.id = sc.id
WHERE sc.deleted_at IS NOT NULL AND (sc.supplier_id IS NULL OR sc.supplier_id <> sc.id)
ORDER BY sc.deleted_at DESC;

-- 5. Liveshow
SELECT (SELECT COUNT(*) FROM campaign) AS campaigns, (SELECT COUNT(*) FROM component) AS components;

-- 6. Método encendido sin credencial propia activa = hoy cobra con la cuenta de Vio (ADR-0028).
--    Un channel sin fila de settings cuenta como encendido para Stripe/Klarna/Vipps (default de api).
--    Revisar el nombre exacto en options.name si algún método no aparece (Qliro/Adyen).
SELECT t.user_id, t.metodo, COUNT(*) AS channels
FROM (
  SELECT cu.user_id, 'STRIPE' AS metodo FROM channel_user cu
    LEFT JOIN channel_user_settings s ON s.id = cu.channel_user_settings_id
    WHERE cu.deleted_at IS NULL AND cu.active = 1
      AND (s.id IS NULL OR s.stripe_payment_intent = 1 OR s.stripe_payment_link = 1 OR s.google_pay = 1 OR s.apple_pay = 1)
  UNION ALL SELECT cu.user_id, 'KLARNA' FROM channel_user cu
    LEFT JOIN channel_user_settings s ON s.id = cu.channel_user_settings_id
    WHERE cu.deleted_at IS NULL AND cu.active = 1 AND (s.id IS NULL OR s.klarna = 1)
  UNION ALL SELECT cu.user_id, 'VIPPS' FROM channel_user cu
    LEFT JOIN channel_user_settings s ON s.id = cu.channel_user_settings_id
    WHERE cu.deleted_at IS NULL AND cu.active = 1 AND (s.id IS NULL OR s.vipps = 1)
  UNION ALL SELECT cu.user_id, 'QLIRO' FROM channel_user cu
    JOIN channel_user_settings s ON s.id = cu.channel_user_settings_id
    WHERE cu.deleted_at IS NULL AND cu.active = 1 AND s.qliro = 1
  UNION ALL SELECT cu.user_id, 'ADYEN' FROM channel_user cu
    JOIN channel_user_settings s ON s.id = cu.channel_user_settings_id
    WHERE cu.deleted_at IS NULL AND cu.active = 1 AND s.adyen = 1
) t
WHERE NOT EXISTS (
  SELECT 1 FROM payment_method pm
  WHERE pm.user_id = t.user_id AND pm.active = 1 AND pm.deleted_at IS NULL
    AND UPPER(JSON_UNQUOTE(JSON_EXTRACT(pm.options, '$.name'))) = t.metodo
)
GROUP BY t.user_id, t.metodo
ORDER BY t.metodo, t.user_id;
```

## Blockers / open questions

- **Operadores y viewers** en v1. **Comisión** (`referralFee`): quién la fija y cómo la
  cobra el publisher.
- **`access.log` de nginx** en Oracle: lo saca Miguel.
- **El `CLAUDE.md` de vio-backend está desactualizado:** dice Azure Container Apps y hoy
  corre en Oracle.

## Next session

- Fixes F0.1 y F0.2 (aprobados) y después F2 (ajustes de Commerce) en la rama
  `feature/brand-publisher`.
