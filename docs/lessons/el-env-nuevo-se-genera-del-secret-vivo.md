---
title: "Un .env nuevo se genera del Secret vivo, no de la copia que bajaste antes"
last-updated: 2026-10-22
---

## Síntoma

Dos cambios en el mismo `.env` el mismo día. El segundo **deshace el primero** sin que nada falle:
no hay error, el `kubectl apply` dice `configured`, el pod arranca bien, y la variable que habías
quitado está otra vez puesta.

## Qué pasó

El 22/10 quité `EMAIL_DELIVERY=on` del Secret `env-sc-api` de producción y lo verifiqué dentro del
pod. Un rato después, en la misma sesión, preparé el mismo `.env` para añadir las partner keys de
Vipps — y lo generé a partir de `current-api.env`, la copia que me había bajado **al principio**,
que todavía llevaba `EMAIL_DELIVERY=on`. Aplicar eso habría reactivado los correos en producción
como efecto colateral invisible de un cambio de Vipps.

No llegó a aplicarse porque el script comprobaba el estado de partida antes de escribir, y dio 1 en
`grep -c "^EMAIL_DELIVERY"` cuando esperaba 0.

## Causa

Una copia del `.env` es una foto del momento en que la bajaste, igual que `git add`. En cuanto
aplicas un cambio, esa copia es historia: cualquier edición posterior construida sobre ella
reintroduce lo que quitaste y borra lo que añadiste.

Y no lo avisa nadie: el Secret se reemplaza entero, no se parchea campo a campo.

## Cómo se evita

- **Volver a leer el Secret justo antes de generar el nuevo `.env`**, siempre, aunque lo hayas
  bajado hace cinco minutos:
  `kubectl get secret env-sc-<svc> -o jsonpath='{.data.\.env}' | base64 -d > live.env`
- **Afirmar el estado de partida en el propio script**, no a ojo: que lo que vas a añadir no esté ya,
  y que lo que quitaste siga fuera. Un `assert` barato convierte un cambio silencioso en un fallo
  ruidoso antes de tocar producción.
- **Diffear contra el Secret vivo**, no contra tu copia: el diff debe tener exactamente las líneas
  que esperas y ninguna más.

Lo mismo vale para el blob: parte del blob de ese momento, no de lo que generaste para el Secret
(pueden divergir a propósito — en producción el Secret lleva variables que el blob no tiene).
