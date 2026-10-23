---
title: "Playbook: merge rápido a QA y a prod con verificación del pod"
last-updated: 2026-10-24
owner: claude
status: live
---

# Merge rápido a QA y a prod con verificación del pod

Cómo se llevaron esta noche (23/10) seis PRs a QA y siete a prod sin dejar ninguno a medias. Vale para cualquier micro
de Vio Commerce con el workflow `deploy.yml` de rama.

## El método

1. **Leer el diff** y compilarlo contra la rama destino (lección: *un PR mergeable puede venir de una base vieja*).
2. **Mergear y esperar al run de CI/CD de la rama destino**, buscando el run por el SHA del merge (no «el último»):
   `gh run list --branch <rama> --json databaseId,headSha` y `gh run watch <id> --exit-status`.
3. **Verificar el pod, no la pipeline**: un pod nuevo `2/2 Running` con menos de 5 minutos, `@vio-/database` en el
   `dist` con la versión esperada, y cero `Unknown column|QueryFailedError|Cannot find module` en sus logs de arranque.
   Cuando el cambio es una línea, `grep` de esa línea en el `dist` del pod (`send_receipt`, `restock: true`).
4. **Probar la ruta cambiada desde dentro del pod** con `curl` a `127.0.0.1:<puerto>` y medir lo que importa
   (`VmHWM` del proceso `node dist/main` antes y después, tiempo, tamaño) — **nunca** ejecutar un segundo `node`
   en un pod que sirve tráfico (lección de Miguel del 23/10).
5. **Comparar respuestas** antes/después con un normalizador (arrays ordenados por `id`): guardar el JSON de referencia
   antes de mergear.

Scripts de referencia de la sesión (en el scratchpad de la sesión del 23/10, copiar al handbook si se reutilizan):
`release-merge.sh <repo> <pr> <rama-prod> <deployment>` y `qa-merge.sh <repo> <pr> <deployment>`.

## Trampas vistas

- **Mergeabilidad «UNKNOWN»** justo después de crear el PR: GitHub tarda unos segundos en calcularla; un script que
  pregunte y pare se queda sin mergear. Esperar hasta que deje de ser `UNKNOWN`.
- **master con su propio chart** (orders, api, extensions): `values.yaml` y `.tgz` de prod distintos de develop. Un
  merge de develop entero cambia los recursos de prod; ir por **cherry-pick** del fichero de servicio o resolver el chart
  a mano (orders #38: valores de prod + el CronJob nuevo, `.tgz` reempaquetado y comprobado extrayéndolo).
- **zsh no parte variables** sin comillas en `set -- $spec`: los bucles de repos van en `bash -c`.
- **El clasificador del agente** pide una autorización explícita de Angelo distinta por tipo de acción en prod: deploy,
  borrado en base, lectura de base. Pedírselas de entrada, todas en un mensaje.
