---
title: "Lesson — GitHub Actions ejecuta cualquier .yml en .github/workflows, el nombre no importa"
last-updated: 2026-09-04
owner: miguel
status: live
---

# GitHub Actions no le importa que el archivo diga "-template"

Encontrado en `vio-automatize`, 2026-09-04.

## Síntoma

Cada push a `develop` de `vio-automatize` disparaba un release completo del kernel (`Kernel release (publish @vio-/* + dispatch to microservices)`), aunque ese repo no es uno de los 7 `package-*` y no debería tener ese workflow en absoluto.

## Causa

`vio-automatize` tenía `kernel-release-template.yml` y `kernel-bump-template.yml` guardados dentro de `.github/workflows/` — pensados como plantillas de referencia para copiar a los 7 `package-*` y a los 11 microservicios respectivamente (el propio comentario dentro del archivo lo dice). Pero GitHub Actions escanea **cualquier archivo `.yml`/`.yaml` dentro de `.github/workflows/`** y lo trata como un workflow activo si tiene un `on:` válido — no le importa que el nombre del archivo contenga "template". Ambos archivos tenían triggers reales (`on: push`, `on: repository_dispatch`), así que ambos estaban activos.

## El fix

Plantillas para copiar a otros repos no van en `.github/workflows/` bajo ningún nombre. Se movieron a `.github/workflow-templates/` (una carpeta cualquiera, sin significado especial para Actions en un repo normal — GitHub solo le da tratamiento especial a esa ruta en un repo literalmente llamado `.github` a nivel organización).

## Cómo detectarlo en otro repo

```bash
gh api repos/<org>/<repo>/actions/workflows --jq '.workflows[] | "\(.state) \(.path)"'
```

Cualquier archivo ahí con `state: active` está corriendo, sin importar el nombre.

## See also

- [ADR-0014: publica solo lo que cambió](../decisions/0014-kernel-publica-solo-lo-que-cambio.md)
- [Journal 2026-09-04](../journal/2026-09/2026-09-04-kernel-release-caos-y-fixes.md)
