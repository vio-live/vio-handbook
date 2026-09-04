---
title: "ADR-0014: El release del kernel publica solo los paquetes que cambiaron de verdad"
last-updated: 2026-09-04
owner: miguel
status: live
---

# ADR-0014: El release del kernel publica solo los paquetes que cambiaron de verdad

## Context

ADR-0013 dejó el release del kernel (`kernel-release.yml`, los 7 `package-*`) invocando siempre `pkg=all` en `change-version-packages.js`/`publish-packages.js` — bumpea y republica los 7 paquetes en cada push a `develop` de cualquiera de los 7, sin condición.

Verificado en vivo el 2026-09-04: en 5 horas, los 7 pasaron de `1.0.248` a `1.0.258` sin que cambiara una sola línea de código real en la mayoría de ellos — cada fix de CI, cada housekeeping, cada intento fallido del incidente de ese día disparaba un release completo de los 7. Angelo, al ver esto: *"si no hay cambio es estúpido que suban de versión y todo se vuelva a lanzar una y otra vez"*.

## Decision

1. Nuevo step `Detect changed kernel packages` en `kernel-release.yml`: para cada uno de los 7, compara el HEAD actual contra el tag `v<version>` del último publish exitoso con `git diff --quiet <tag> HEAD -- . ':!.github'` (excluye `.github/` para que cambios al propio workflow no cuenten como "el paquete cambió"). Si no existe el tag (release nuevo, o profundidad de clone insuficiente), se trata como cambiado — falla hacia el lado seguro.
2. `Bump versions`/`Publish` reciben `pkg=<lista-detectada>` en vez de `pkg=all`. Si la lista sale vacía, ambos steps (y el dispatch a los 11 microservicios) se saltan enteros — no se toca npm, no se avisa a nadie.
3. `change-version-packages.js`/`publish-packages.js` ya soportaban modo selectivo (`pkg=<nombre>`, cascada a dependientes reales vía `isDependency`) desde antes — solo estaba sin usar porque el workflow siempre forzaba `all`. Se extendió `pkg=` para aceptar lista separada por coma.
4. La cascada por dependencia **se mantiene activa** (no se pasa `dependency=0`). Si `database` cambia de verdad, sus dependientes reales (`testing`, `definitions`, `service`) también se bumpean y republican — porque los pines son exactos, no rangos (`"@vio-/database": "1.0.257"`, no `^1.0.0`), así que si no se actualiza el pin del dependiente, nadie va a instalar nunca la versión nueva por más que se publique.
5. Se agrega `computeSyncedVersion()`: el target de versión es el MAX actual entre los 7 + 1, no "cada paquete +1 sobre sí mismo" — necesario para que un paquete que quedó atrás (por un run que murió antes de llegar a él) converja en una sola corrida en vez de quedar perpetuamente detrás.
6. Se agrega `workflow_dispatch` con input `pkg` opcional, para forzar paquetes puntuales sin necesidad de fabricar un cambio de código falso (caso real: `service` necesitaba alcanzar al resto sin tener ningún cambio de fuente pendiente).

## Rationale

- **Excluir `.github/` del diff, no solo confiar en "cambió algo"**: sin esto, el propio PR que implementa este ADR se auto-detectaría como "cambio real" en los 7 y dispararía un release al mergearse — exactamente el problema que se quiere resolver.
- **No usar rangos de versión (`^1.0.0`) para desacoplar en vez de diff-based detection**: se consideró y se descartó — cambiar a rangos es una migración mucho más grande (afecta a los 11 microservicios también) y pierde la garantía de "esta combinación exacta de 7 se probó junta", que el equipo prefiere mantener explícita.
- **Mantener la cascada por dependencia**: sin ella, un cambio real en `database` nunca llegaría a los paquetes que dependen de ella (sus pines quedarían apuntando a la versión vieja para siempre), silenciosamente.

## Consequences

- Los números de versión de los 7 paquetes ya no avanzan en lockstep perfecto — pueden divergir con el tiempo (ej. `service` en `1.0.256` mientras el resto está en `1.0.258`), y **eso ahora es esperado**, no un bug a arreglar. La garantía real (que cada versión publicada es un set internamente consistente vía pines exactos) se mantiene igual.
- Un push a `develop` en uno de los 7 que no toca su propio código (solo CI, docs, etc.) ya no genera un release — el equipo lo va a notar como "no pasó nada" en vez de un run visible, es el comportamiento nuevo correcto.
- Verificado en producción real el mismo día: un run con cero cambios reales reportó "Ningún paquete del kernel tiene cambios reales desde su último publish. No se bumpeó ni publicó nada." y cerró en segundos, sin tocar npm.

## Alternatives considered

- **Dejar `pkg=all` y solo optimizar el tiempo (caché, retry)**: hecho también (ver journal 2026-09-04), pero no resuelve el problema de fondo que señaló Angelo — seguiría publicando 7 paquetes idénticos bit a bit bajo un nuevo número, solo que más rápido.
- **Versionado independiente por paquete + rangos semver**: descartado por ahora, ver Rationale — puede reconsiderarse si el volumen de releases crece mucho y la garantía de "set probado junto" deja de justificar el costo.

## References

- [ADR-0013: Release automático del kernel](0013-release-automatico-del-kernel.md)
- [Journal 2026-09-04 — caos del kernel y fixes](../journal/2026-09/2026-09-04-kernel-release-caos-y-fixes.md)
- [vio-automatize PR #5](https://github.com/vio-live/vio-automatize/pull/5) — soporte de lista + `computeSyncedVersion`
