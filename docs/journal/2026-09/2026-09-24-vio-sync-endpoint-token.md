---
date: 2026-09-24
session: vio-sync-endpoint-token
participants: [angelo, claude]
status: live
---

# Session — 2026-09-24 — La noche aguantó, tarjetas al día y la mitad del app del rediseño

## Goal

Status de la mañana después del arreglo de tokens, dejar las tarjetas de Alan reflejando
la realidad, y preparar la parte del app del rediseño del token.

## Done

**Status de la noche**: el cron corrió **24 veces en 12 h** (cada 30 minutos), **cero 401**
de Shopify y Gladkokken siguió importando; la última llamada a su tienda fue un 200. Villoid
y Makeup Mekka **siguen sin instalar** (cero señales en 20 h). Decisión de Angelo: no
regenerar el link de Villoid antes de tiempo — Michael los está empujando, y si vence el
2026-09-25 13:42 se manda uno nuevo ese día.

**Alan cerró su tarjeta** ([XxteZiYt](https://trello.com/c/XxteZiYt), Done, 17/17): mergeó y
desplegó el PR #8, lo probó forzando `expires_in = null` en una cuenta de prueba, y votó por
**quedarse con la heurística** — sin bandera ni migración, porque las apps custom son
temporales. Coincide con lo que habíamos propuesto.

**Tarjetas al día**, para que tenga el cuadro completo de lo que pasó mientras no estaba:
- Comentario de cierre en `XxteZiYt` separando lo hecho, lo decidido y lo que sigue abierto.
- [J7E6j9dM](https://trello.com/c/J7E6j9dM): los logs de `extensions` siguen imprimiendo
  tokens de las tiendas por tres vías que el PR #8 no tocaba (queries de TypeORM,
  `graphGetProductById`/`getVariant`, dump de `getEcomUser`). No urgente: esos tokens
  caducan solos a los ~50 minutos.
- [u2MfJLCf](https://trello.com/c/u2MfJLCf): el rediseño del token, **preparar sin
  desplegar**, con la implementación sin migración (mapa tienda → app en variables de
  entorno de `extensions` + caché corto en Redis).
- [x4L6KDhY](https://trello.com/c/x4L6KDhY): la hipótesis del stock quedó anotada; Angelo
  la aparca por ahora.

**La mitad del app del rediseño** (`16bbebd`, desplegado en los cuatro proyectos):
`GET /internal/token` devuelve el token vigente ya rotado y su vencimiento, con el mismo
secreto que la ruta de sync. Es **aditiva**: nadie la llama hasta que `extensions` la use,
así que no toca a los clientes. Las guardas y la lectura de la sesión offline quedaron
compartidas entre las dos rutas. 205 tests, 100 % de cobertura, typecheck, lint y build
limpios. Verificada en prod: sin credencial 401; con el secreto devuelve el token y su
vencimiento (~45 minutos por delante).

## Decisions

- La app pública queda **aparcada hasta el 2026-10-05**; no se retoma el tema hasta entonces.
- Prioridad del día: que los clientes instalen y sientan que funciona. Si algo falla, se
  recuperan los productos con `?ids=` como se hizo con Gladkokken.
- El rediseño del token se **prepara**, no se despliega, hasta decidir la ventana.

## Blockers / open questions

- Villoid y Makeup Mekka sin instalar; el link de Villoid vence el 2026-09-25 13:42.
- La mitad de `extensions` del rediseño depende de Alan y de cuándo puedan desplegar.

## Next session

- Si Villoid no instaló, generar link nuevo el 25.
- Retomar la hipótesis del stock y el ahorro de webhooks cuando Angelo lo pida.
