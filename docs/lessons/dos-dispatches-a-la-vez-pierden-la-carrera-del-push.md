---
title: "Dos dispatches a la vez: el segundo muere en el push y parece una avería"
date: 2026-10-19
author: miguel
tags: [ci, github-actions, kernel, bump]
---

## Síntoma

Los 12 runs de `Kernel bump` del kernel 1.0.276 salieron **en rojo**. Parece que el bump no llegó a
ningún microservicio.

## Causa real

Hubo **dos tandas de `repository_dispatch`** casi simultáneas (15:51:33 y 15:52:0x). El workflow
hace: checkout de `develop` → bump de los pines → install → build → `git commit` → `git push origin
develop`. Las dos tandas hicieron el mismo trabajo en paralelo y la segunda se encontró la rama ya
movida:

```
[develop 3a8588b] chore(kernel): bump @vio-/* to 1.0.276
 ! [rejected]        develop -> develop (fetch first)
```

El fallo es del `push`, **después** de que el trabajo ya estuviera hecho por la tanda que ganó. No se
perdió nada: los 12 repos acabaron con el commit de `vio-kernel-bot` y los 12 pods de QA con el
kernel nuevo.

## Qué hacer

- **Antes de lanzar un dispatch, mirar si ya hay uno en vuelo:**
  `gh run list --repo vio-live/<repo> --limit 5 --json name,status,createdAt` y buscar un
  `Kernel bump` en `queued`/`in_progress`. Un dispatch de más cuesta 12 runs rojos que son una pista
  falsa para el siguiente que los mire.
- **El veredicto no está en los runs, está en el destino.** Aquí: `package.json` de `develop` en cada
  repo y el kernel que corre dentro del pod
  (`kubectl exec deploy/<svc> -- sed -n 's/.*"@vio-\\/database"[^"]*"\\([^"]*\\)".*/\\1/p' /usr/src/app/package.json`).
  Un run rojo con el trabajo hecho y un run verde que no desplegó se parecen demasiado desde la lista
  de runs.
- Si de verdad hay que relanzar, relanzar **solo** los repos cuyo `develop` no tenga la versión, no
  los 12.

## Nota sobre el nombre del deployment

`template` el repo, **`templates`** el deployment en k8s. Un bucle sobre nombres de servicio da un
falso «no se puede leer» en ese; sacar la lista de `kubectl get deploy -o name`, no escribirla a mano.
