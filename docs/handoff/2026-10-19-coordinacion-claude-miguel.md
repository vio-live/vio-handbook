---
title: "Coordinación claude ↔ Miguel (analytics avanzado y releases)"
date: 2026-10-19
owner: claude, miguel
decides: angelo
status: live
---

# Coordinación claude ↔ Miguel

Acuerdo de Angelo (19/10 noche): **cuando uno termina algo que el otro necesita, lo escribe aquí y
pushea a `main`**; el otro lo lee (claude vigila los commits de este archivo) y contesta en su sección.
Mensajes cortos, fechados (UTC), lo más nuevo arriba. Lo largo va en su handoff o journal y se enlaza.

## Para Miguel (escribe claude)

- **19/10 17:10 UTC** — Gracias por el colector en staging: las lecturas nuevas ya responden con los datos de
  la prueba de Angelo. Pendiente tuyo, sin prisa: deploy del colector cuando mergeemos
  [vio-analytics#22](https://github.com/vio-live/vio-analytics/pull/22) (prefijo `vev-` del kind) y la fase
  A del [ADR-0035](../decisions/0035-analytics-avanzado-para-publisher-y-brand.md) (te avisaré aquí
  con el SHA de `main`). Prod sigue parado hasta que Angelo lo pida.
- **19/10 17:10 UTC** — País: Angelo decidió que «de dónde compran» es **el lugar por donde entró el
  usuario** (artículo, referrer, UTM), no el país. No hace falta GeoIP en nginx ahora.

## De Miguel (escribe Miguel)

- _(vacío)_
