---
date: 2026-11-09
session: Dos sesiones del agente miguel trabajaron el mismo encargo del canal (deploy #47) sin saberlo
participants: [angelo, miguel]
status: live
---

## Qué pasó

Angelo me avisó por Discord («hay algo para ti en handoff») del encargo de claude: desplegar el
colector `39c1edc` (#47) en staging y prod. Al ir a hacerlo, **ya estaba desplegado**: las dos VMs en
`39c1edc`, respaldos `vio-analytics-backup-pre-39c1edc-*.tgz` de las 09:55-09:57 UTC, y una entrada
en el canal firmada «Miguel» a las 11:01 (`88ddbaf`) contando el despliegue y el resultado.

No fui yo. Lo verifiqué antes de dar nada por bueno y **no repetí el despliegue**.

## Quién era

`sessions_list` lo aclara: **la otra sesión es del mismo agente `miguel`**, no otro agente ni otra
persona.

| | esta sesión | la otra |
|---|---|---|
| Session key | `agent:miguel:discord:direct:752638331128643616` | `agent:miguel:main` |
| Canal | Discord DM con Angelo | webchat |
| Qué la mueve | mensajes de Angelo | **heartbeats** |
| Modelo | `claude-opus-5` | `claude-sonnet-5` |
| sessionId | `6775b52a-…` | `08b5a9eb-9047-4c54-8785-7af6c67c5c22` |

Su último mensaje (11:24) era: *«HEAD del handoff en `f38b8f3` es mi propia última entrada… Nada
pendiente. HEARTBEAT_OK»*. O sea: está leyendo el canal en cada heartbeat y trabajando lo que
encuentra — que es exactamente lo que le dice `HEARTBEAT.md` desde el 28/10 («Si hay entradas nuevas
en el handoff dirigidas a mí, las leo y las trabajo»).

**No hay nada roto ni intruso.** Son dos lanes del mismo agente con la misma instrucción y **sin
ningún mecanismo de exclusión entre ellas**: las dos leen el canal, las dos pueden actuar, y ninguna
ve el trabajo de la otra hasta que aparece commiteado en el handbook.

## Qué costó y qué no

- **No hubo daño en prod.** El despliegue fue correcto: árbol entero (`src/` 09:38, `dist/` 09:57),
  `.env` intacto por md5, respaldos en su sitio. Lo verifiqué pieza por pieza.
- **Sí hubo trabajo duplicado**: el mismo diagnóstico hecho dos veces, dos entradas en el canal para
  un encargo, y el riesgo real de haber desplegado dos veces seguidas si yo no hubiera comprobado el
  estado antes de empezar.
- Lo único que salvó la situación fue **mirar el estado antes de actuar** en vez de ejecutar el
  encargo tal como venía escrito.

## Lo que sí aportó esta sesión

La otra dejó una pregunta abierta («no sé por qué el fallback por URL no rescata el 4142»). Esa la
cerré: el guarda es `l_content_id != ''` y el eco **no llega vacío, llega con la URL como id**.
Detalle en [el journal del fallback](2026-11-09-por-que-el-fallback-no-rescata-el-4142.md).
claude ya respondió: tengo razón, #48 no se despliega y viene un #49.

## Pendiente — decisión de Angelo

Angelo: «documenta y hablo con quien está trabajando». Lo deja en su mano. Las opciones, por si
sirven:

1. **Quitar del `HEARTBEAT.md` el mandato de trabajar el canal** y dejar que sólo lo trabaje la
   sesión de Discord (que es la que habla con Angelo). El heartbeat podría limitarse a avisar.
2. Dejarlo como está, ahora que la sesión de Discord **vigila el canal cada 5 min** por su cuenta
   (cron `escucha-handoff`, ver
   [infrastructure/escucha-del-canal-de-coordinacion](../../infrastructure/escucha-del-canal-de-coordinacion.md)) —
   pero entonces las dos lanes siguen pudiendo coincidir.
3. Un cerrojo compartido (una nota en el canal al empezar un encargo, antes de tocar nada).

No toco `HEARTBEAT.md` por iniciativa propia: es la instrucción que gobierna a la otra sesión y
cambiarla sin que Angelo hable con ella es justo el tipo de cosa que debería decidir él.

## Lección

Un encargo escrito en un canal compartido **no es prueba de que esté sin hacer**. Antes de ejecutar,
comprobar el estado del sistema (`/health`, versión, respaldos, el propio canal un poco más abajo).
Queda en [lessons/el-encargo-de-un-canal-puede-estar-ya-hecho](../../lessons/el-encargo-de-un-canal-puede-estar-ya-hecho.md).
