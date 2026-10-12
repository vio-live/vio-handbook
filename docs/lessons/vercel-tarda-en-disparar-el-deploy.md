---
title: Vercel tarda en disparar el deploy tras un push; no concluir que la integración está rota
last-updated: 2026-10-12
---

## Síntoma
Mergeas a la rama de producción, consultas `GET /v6/deployments` y no aparece ningún deployment del
commit nuevo. Mirar la configuración no ayuda: `productionBranch` correcto,
`gitProviderOptions.createDeployments: enabled`, `paused: null`, sin `ignoreCommand`, e histórico de
deployments de esa rama que sí funcionaron.

## Qué pasó el 12/10
Tras mergear `webapp-vio-commerce#49` consulté la API unas doce veces seguidas, no vi nada de
`master` y concluí que la integración Git estaba caída desde el 08/10 (el último deployment era de
esa fecha). Disparé un deployment de producción a mano por API.

**La integración no estaba caída: tardaba.** Vercel disparó el suyo un minuto después del mío.
Quedaron dos builds del mismo commit; el dominio quedó servido por el automático y el mío huérfano
sin alias. Sin daño, porque era el mismo commit — pero fue una conclusión precipitada y un build de
más.

## Regla
"No veo el efecto todavía" no es "el mecanismo está roto". Antes de forzar nada a mano:

1. Esperar con holgura de minutos, no de segundos. Consultar rápido doce veces seguidas es la misma
   espera, no más información.
2. Si la configuración del lado del proveedor está sana y la rama tiene deployments históricos
   correctos, la hipótesis por defecto es **latencia**, no avería.
3. Forzar a mano solo tras descartar la latencia, y si se fuerza, comprobar después **qué
   deployment quedó aliasado al dominio** — no asumir que es el propio.

Mismo patrón ya visto con las reglas de Cloudflare recién creadas y con Azure tardando más de 30
horas en cerrar un día de coste. Es el tercer sitio donde me muerde lo mismo: **el panel del
proveedor no es instantáneo**.

## Nota aparte, útil
Asignar una rama a un dominio (`PATCH /projects/<id>/domains/<dominio>` con `gitBranch`) **falla en
la v9** con `git_branch_not_found` aunque la rama exista; **la v10 lo acepta**.
