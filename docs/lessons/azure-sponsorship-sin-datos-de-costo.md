---
title: "Lesson: en la sub Sponsorship no hay costo por recurso y las métricas de uso engañan"
last-updated: 2026-09-16
owner: miguel
status: live
---

# Sponsorship: sin costo por recurso y métricas de uso que marcan 0

**Síntoma:** en el audit de costos del 2026-09-16, la Cost Management Query API respondió 429 varias veces y, cuando respondió, vino **sin filas**. Azure Monitor marcaba 0 requests en 30 días en `ca-api-vio-production`, 0 en Front Door y 0 en Service Bus, pero `api.vio.live` apunta a esa app y responde 200.

**Causa real:** la oferta "Microsoft Azure Sponsorship" no expone costos por recurso en Cost Management (el saldo solo se ve en microsoftazuresponsorships.com). Y varias métricas de plataforma (`Requests` de Container Apps, `RequestCount` de AFD, `Transactions` de storage) vuelven en 0 o vacías sin dar error.

**Cómo se evita:**
- Estimar con la Azure Retail Prices API (`prices.azure.com`), multiplicada por el inventario (SKU × horas).
- **No declarar "sin uso" solo por una métrica.** Buscar evidencia en la configuración (qué referencia el recurso, DNS, la DB), en los logs o en una request real.
- Métricas que sí sirvieron: CPU y memoria de MySQL y PostgreSQL, `connectedclients` de Redis, capacidad de blob por tier, tokens de Azure OpenAI.
- Para medir storage con millones de blobs: blob inventory (CSV) en vez de listar con `az`. Ojo: cambiar de tier cuesta una operación de escritura por blob (6,16 M a Cool ≈ $68).
