---
title: "Guardia diaria sobre el QA de Alan: verificar, arreglar, subir y contestar"
date: 2026-11-04
owner: claude
decides: angelo
status: live
tags: [playbook, qa, alan, trello, staging, vipps, kustom, replit]
---

# Guardia diaria sobre el QA de Alan

Alan prueba en QA y reporta en el tablero **Dev** de Trello. Esta guardia hace que el ciclo
**reporte → verificación → arreglo → despliegue a QA → respuesta** no dependa de Angelo. Se arranca cada día que
Alan trabaja (en esta máquina, `/guardia-alan`), mientras QA está encendido (06:30–23:00 UTC, entre semana).

Nació el 16/10 («quédate controlando… le escribes como que soy yo cuando esté listo») y se fijó como rutina el
4/11. Lecciones previas: [verify-alan-claims-against-code](../lessons/verify-alan-claims-against-code.md).

## Reglas

1. **Nada se da por bueno sin verlo.** Un «OK» de Alan se comprueba en los datos de QA (orden, checkout, canal,
   campaña) antes de tildar o cerrar. Un «falla» se reproduce o se busca en logs antes de tocar código.
2. **Si no está claro, se pregunta.** Qué URL, qué hora UTC, qué cuenta, qué producto, captura o vídeo, y si lo
   repitió. Una pregunta concreta en la tarjeta; no se adivina.
3. **Se contesta cuando está hecho**, en la tarjeta, con la cuenta de Angelo: qué era, qué cambió, qué volver a
   probar. Sin «lo miro».
4. **El SDK web afecta a dos sitios a la vez:** las páginas de **Vev** (QA y prod comparten paquete) y el artículo
   de **Replit** de Mote & Livsstil (producción, fija la versión de npm). Un arreglo en el SDK se prueba en Vev de
   QA y, si va a prod, se publica en npm (lo decide Angelo) y Replit tiene que subir la versión. Nunca se da un
   cambio de SDK por cerrado solo porque Vev lo vea.
5. **Los métodos de pago son independientes entre sí** y por marca y canal: Vipps, Kustom, Stripe, Walley y Nexi
   tienen cada uno su código, su cuenta de prueba y su cadena de cobro. Que Vipps funcione no dice nada de Kustom, y
   un arreglo en uno no se extiende a otro sin probarlo.
6. **Foco actual (desde el 4/11): Replit, Vipps y Kustom.** Lo que toque eso va primero; lo demás se anota y se
   hace después.
7. **Código:** rama `feature/<slug>`, tests, PR a `develop`, merge y deploy a QA (ADR-0001 y la regla de staging
   rápido: una ronda, nada a medias). Producción solo con el OK escrito de Angelo. Nunca sobre código de Alan sin
   confirmación.
8. **Nunca** Slack ni correo en nombre de Angelo. Solo la tarjeta.

## Por cada reporte

| Paso | Qué | Dónde |
|---|---|---|
| 1 | Leer el comentario entero, abrir las capturas, apuntar hora UTC e ids | Trello |
| 2 | Reproducir o buscar la evidencia: orden/checkout en la base de QA, logs del micro (`kubectl --context kubernetesqa-sc logs`), `/v2/mobile/config`, GraphQL | QA |
| 3 | Si falta contexto → pregunta concreta en la tarjeta y seguir con otra cosa | Trello |
| 4 | Causa en el código con el agente del servicio (`svc-*`, `front-commerce`, SDK) | repos |
| 5 | Arreglo + test; revisión independiente si toca dinero, auth o tenants | rama |
| 6 | Merge a `develop`, deploy a QA, verificar desde fuera (no «CI en verde» sin mirarlo) | Actions / AKS |
| 7 | Si es SDK: Vev de QA republicado; anotar que Replit queda pendiente de npm | Vev |
| 8 | Contestar en la tarjeta: qué era, qué cambió, qué volver a probar, ids | Trello |
| 9 | Línea en el journal del día con PR, commit y horas | handbook |

## Cierre del día

Journal `docs/journal/AAAA-MM/AAAA-MM-DD-seguimiento-alan.md` cerrado (Done / Blockers / Next), push a `main`, y la
cola de Alan para mañana escrita en la primera tarjeta que vaya a abrir.
