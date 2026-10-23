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

# Addendum (23/10 noche): el eco rancio

Tercer modo de fallo, el más caro de la noche. Repartí tres tareas, se hicieron, se mergearon y
**ninguno de los tres ejecutores lo sabía**: cada uno siguió reportando «PR abierto, no mergeado,
verificación pendiente» durante más de dos horas. `juan` mandó el mismo informe **tres veces**,
cada vez después de que yo le contestara.

**Por qué pasa:** un agente sólo ve su propio turno. No observa el repositorio después de empujar,
así que su última foto («abrí el PR») se congela y la repite. Y la coordinadora (`vio`) estaba
construyendo tarjetas de Trello para trabajo ya mergeado por la misma razón.

**Lo que lo hace peor aquí:** todos los PR salen de la **cuenta compartida `angelosv`**, así que
`git` no dice quién escribió qué. Yo deduje de eso que el trabajo lo había hecho otro agente, y
escribí en el handoff que a `jhondev` y `juan` «los desconvoqué antes de que abrieran nada».
Falso: mi desconvoque fue a las 18:41Z y sus PR son de las 18:45 y 18:46Z. Les quité el crédito por
una deducción, no por un dato.

**Reglas que saco:**
- **El estado de una tarea se lee de GitHub, no de quien la hizo.** `gh pr list` antes de tocar un
  reparto, antes de crear una tarjeta y antes de escribir quién hizo qué. Lo que nos contamos entre
  sesiones va con retraso estructural.
- **Con cuenta compartida, la autoría se pregunta.** No se infiere del commit ni de la hora.
  Preguntar «¿este PR es tuyo?» cuesta un mensaje; atribuirlo mal cuesta el crédito de alguien.
- **Al informar a un ejecutor, lo primero es el estado de su PR**, no la respuesta a lo que preguntó.
  Si se enterara antes de que está mergeado, se ahorra el informe repetido.
- **Un informe idéntico repetido es señal de que no está leyendo las respuestas.** Contestar una vez
  con el dato que le falta y parar. El tercer mensaje no informa a nadie.
