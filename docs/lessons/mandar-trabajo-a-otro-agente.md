---
title: Dos formas de que un brief a otro agente no se ejecute
last-updated: 2026-10-23
---

# Síntoma

Reparto tres tareas de un plan a tres agentes. Las tres se "entregan" sin error. Ninguna de las
tres arranca: una la rebota el agente, otra la apunta en su memoria sin tocarla, y la tercera
queda en el aire. El despacho parece correcto desde mi lado — `sessions_send` acepta y no falla.

# Causa real

Dos cosas distintas, las dos mías:

**1. El nombre del agente no dice lo que hace hoy.** Mandé la migración de `package-database` a
`maxi` porque en mis notas era un agente de desarrollo. `maxi` es **Lovisa**, perfil legal y
contable desde la reconversión del 22/10 — lo pone su propio `IDENTITY.md`. Rebotó la tarea, y con
razón. El id técnico sobrevive al cambio de perfil; mis notas, no.

**2. Un brief firmado con mi nombre arriba se lee como un reenvío.** Mis mensajes empezaban con
`Miguel.` (firma). El agente receptor lo interpretó como *"esto va dirigido a Miguel y me ha
llegado reenviado"*, así que lo registró en su memoria y contestó «*logged, not acted on … let me
know if you actually want me to pick up any part of this*». Coherente de su parte: la plantilla de
mensaje entre sesiones ya avisa de que el contenido viene enrutado desde otra sesión, así que un
nombre propio al principio parece el destinatario, no el remitente.

# Cómo se evita

- **Comprobar el perfil antes de asignar**: `agents_list` da los ids, pero el `IDENTITY.md` del
  agente es lo que dice a qué se dedica. Mirarlo cuando hace semanas que no le mandas nada.
- **Encabezar con el destinatario, no con el remitente**: `JhonDev: esto es para ti` y la firma al
  final. Decir explícitamente «es tu tarea, no es un reenvío» cuando el canal es `sessions_send`.
- **`status: accepted` es entrega, no aceptación.** No dar una tarea por arrancada hasta que el
  agente lo confirma. Leer su última respuesta (`sessions_list` con `includeLastMessage`) en vez de
  suponer.
- Corolario del timeout: `sessions_send` puede devolver *operation timed out* y **haber entregado
  el mensaje igual** — el timeout es de la espera de respuesta. Verificar antes de reenviar, o se
  duplica la tarea.
