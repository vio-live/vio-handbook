---
date: 2026-11-26
session: afternoon
participants: [angelo, claude]
status: live
---

# Session — 2026-11-26 — webapp: bloque «Daily report» en el detalle de la campaña

## Goal

Construir en `webapp-vio-commerce` el bloque del informe diario por campaña (SPEC
`~/vio-commerce/entregables/informe-diario/SPEC.md` §6) contra el contrato §1 del micro de campañas,
que se construye en paralelo y todavía no está en QA.

## Done

- **PR [#119](https://github.com/vio-live/webapp-vio-commerce/pull/119)** a `develop`, rama
  `feature/informe-diario-campana` (commit `a3e377b`). **Sin mergear.**
- Tarjeta `src/views/campaign-detail/daily-report.jsx` (`DailyReportCard`), entre Sponsors y Experiences,
  con `CAMPAIGNS_V2`. Textos en inglés, como el resto de la página: «Daily report», «To», «Cc», «Day 1»,
  «Send test to me», «Preview PDF».
  - Interruptor que guarda al cambiar con lo que haya en el form; encender sin «To» muestra el error en
    el campo y no guarda.
  - To/Cc separados por coma (sin chips: el repo no tiene un input de chips), recortados, sin
    repetidos, máximo 10; errores por campo, locales y de los 400 del PUT.
  - Day 1 con «First day with readers: 25 Nov» + «Use it» cuando está vacío.
  - Estado «Last sent 26 Nov, 07:00 — report for 25 Nov.» / `lastError` en rojo.
  - Test y preview con un «Report for» que por defecto es ayer en Oslo. El preview se baja como blob con
    el Bearer y se abre en una pestaña que se crea dentro del clic (Safari); si no hay pestaña, se baja
    como archivo.
  - 503 `REPORT_NOT_CONFIGURED` apaga test y preview con un aviso, y los ajustes se siguen guardando.
    Con 404 sin `code` (micro sin la ruta) o 403, la tarjeta no aparece.
- Libs: `src/lib/campaigns.js` (cabecera con el contrato, hooks, llamadas y helpers puros),
  `src/lib/vio.js` → `vioApiBlob`, `src/lib/format.js` → `fmtCalendarDay` (día de calendario sin
  correrse de zona).
- Verificación: jest 114 suites / 1256 tests en verde (+2 suites / +35 tests); lint con los 2 errores de
  siempre en `views/shell`; `next build` en verde. Probado en local contra un micro simulado con el
  contrato §1 (capturas en el scratchpad de la sesión). **Sin verificar contra QA.**

## Decisions

- Interruptor = guardar el form entero con `enabled` cambiado (el PUT reemplaza). Save/Discard en la
  cabecera de la tarjeta, como Details.
- El front quita los duplicados antes de mandar, así no importa si el micro los rechaza o los limpia.
- Visibilidad: la misma regla que los códigos (`CAMPAIGNS_V2`, y la página ya pide `campaigns:manage`).

## Blockers

Huecos del contrato (no se tocó; avisados en el PR):
- `INVALID_EMAIL` / `TOO_MANY_RECIPIENTS` no dicen de qué lista son. El front lee `field` (arriba o en
  `details`) y, si no viene, lo deduce de lo que mandó.
- La forma del 400 no está fijada: el código se lee de `code`, `error` o un `message` pelado.
- El GET no dice si el envío está configurado: el estado deshabilitado solo aparece tras el primer
  intento de test o preview.
- No está dicho si `preview` sin `day` es válido: el front siempre manda `day`.

## Next

- Cuando el micro esté en QA: probar el camino en staging con el navegador (toggle, 400 por campo, test,
  preview, 503) y ajustar si el micro manda `field` u otra forma de error.
- Merge de #119 tras el diff leído y el micro desplegado.
