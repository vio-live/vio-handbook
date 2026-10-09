---
title: "Lesson — npm publish confirma antes de que el registro propague (ETARGET race)"
last-updated: 2026-09-04
owner: miguel
status: live
---

# `npm publish` confirma antes de que el registro propague

Encontrado en el release del kernel (`vio-automatize`), 2026-09-04.

## Síntoma

`npm publish` termina OK, y milisegundos después un `npm install <pkg>@<version>` del mismo paquete que se acaba de publicar falla:

```
npm error code ETARGET
npm error notarget No matching version found for @vio-/definitions@1.0.254.
```

La versión sí existe — `npm view <pkg> version` la confirma segundos después.

## Causa

npm confirma la escritura de un publish antes de que su índice de lectura (el que resuelve `npm install pkg@version`) haya propagado. Es una condición de carrera del lado del registro, no un fallo real del publish. El hueco observado fue de 18ms a más de 15s según el caso — no es un timing fijo.

## El fix

Retry con backoff en el paso de verificación post-publish específicamente (no en el publish en sí, no en build, no en git — esos si fallan de verdad indican un problema real). Con 3 intentos x 5s planos no alcanzó una vez (falló igual pasados los 15s); se subió a 6 intentos con backoff lineal creciente (5s, 10s, 15s...) para dar ~105s de margen total antes de darse por vencido de verdad.

```js
const runWithRetry = (command, options, errorLabel, retries = 6, baseDelaySeconds = 5) => {
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = shelljs.exec(command, options);
    if (result.code === 0) return result;
    if (attempt === retries) { /* fatal, abortar */ }
    shelljs.exec(`sleep ${baseDelaySeconds * attempt}`);
  }
};
```

## Ojo con esto

El mensaje de error del script decía `"FATAL: ... aborting, nothing published"` cuando en realidad **sí se había publicado** — el publish real había funcionado, solo la verificación post-publish falló. Ese mensaje mentía y costó tiempo de diagnóstico. Si vas a loggear un abort en un paso de verificación, dejá explícito que el paso ANTERIOR (el publish real) puede haber tenido éxito igual.

## See also

- [ADR-0013: Release automático del kernel](../decisions/0013-release-automatico-del-kernel.md)
- [Journal 2026-09-04](../journal/2026-09/2026-09-04-kernel-release-caos-y-fixes.md)

## > [claude, 2026-10-09] Dos variantes más, al publicar `@vio-live/web-sdk` 0.19.0

- **403 «You may not perform that action with these credentials»** con un usuario que *sí* es
  maintainer: el token de `~/.npmrc` era **granular de solo lectura** (en la cuenta hay varios;
  `npm token list --json` dice `permissions` de cada uno sin enseñar el valor). `npm login` deja un
  token de sesión que puede publicar (y sigue pudiendo leer los `@vio-/*`).
- Tras un publish correcto con login web, npm respondió *«Your package is being processed and may
  take a few minutes to become available»*: `npm view … dist-tags.latest` siguió diciendo la
  versión vieja ~2 minutos. Mirar el log (`~/.npm/_logs/*-debug-0.log`: `PUT 202` + `exit 0`) antes
  de concluir que no se publicó, y esperar en bucle a que `latest` cambie.
