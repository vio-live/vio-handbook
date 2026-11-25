# Un aviso publicado con tu propio usuario no te avisa

**Síntoma.** La VM de ClickHouse de analytics desapareció el 23/11/2026 a las 09:10 UTC y se arregló el
25/11 a las 16:10 UTC. Se dio por hecho que no había detección («estuvo dos días fallando sin que nadie lo
viera») y se pidió una alerta nueva.

**Lo que pasó de verdad.** La detección existía y saltó a los 53 minutos:

- 23/11 10:03 UTC, `#vio-ordenes`: «Aviso de órdenes: el colector no responde a /stats/recent».
- Desde las 10:30 UTC, cada hora de 07 a 23: «Datos parados — el colector no responde a /stats/recent
  (TimeoutError)». **35 mensajes** hasta el 25/11 16:06 UTC.
- Seis informes diarios (Careless y Faves, dos noches) publicaron «no se pudo generar: 504».

Nadie reaccionó a ninguno.

**Causa real.** Tres cosas, ninguna de detección:

1. **El aviso no notificaba a nadie.** Las tareas publican con el conector de Slack, que escribe **como
   Angelo**, y `#vio-ordenes` tiene **un solo miembro: Angelo**. Slack no notifica los mensajes propios. El
   canal se llenó en silencio.
2. **El texto no decía qué estaba roto ni qué se arriesgaba.** «Datos parados — el colector no responde a
   /stats/recent (TimeoutError)» se lee como un informe que tarda. No decía que ClickHouse no aceptaba
   escrituras, ni que los eventos solo vivían en la memoria del colector, ni desde cuándo.
3. **La comprobación a mano tranquilizaba.** `/health` contestaba 200 y `status: ok` con
   `clickhouse.lastError: "Timeout error."` al lado. El journal de Boots lo anota así el 25/11: «`/health` 200».

Y 35 mensajes idénticos son ruido: el número 2 ya no se lee.

**Regla.**

- Una alerta existe cuando **le llega a alguien que no la escribió**. Al montar una, probar el camino entero
  hasta la notificación (¿quién está en el canal?, ¿con qué usuario se publica?, ¿suena en algún sitio?), no
  solo que el script detecta.
- El mensaje dice **qué pasa, desde cuándo, qué se pierde y qué no hacer**. En este caso: no reiniciar el
  colector, porque lo que espera en memoria se va con el proceso.
- Se avisa la primera vez, se recuerda cada cierto tiempo **con las cifras del momento** y se cierra con un
  mensaje cuando se arregla. No el mismo texto cada hora.
- Un endpoint de salud que dice `ok` mientras una dependencia falla es peor que no tenerlo.

**Cómo se comprueba.**

- Miembros del canal: en Slack, o `slack_list_channel_members` del conector.
- Quién firma: los mensajes del conector salen con el nombre del usuario y «Sent using Claude» debajo. Si el
  autor es el único que debería enterarse, no se entera.

**Qué se hizo.** Journal
[2026-11-25-colector-aviso-escrituras-paradas](../journal/2026-11/2026-11-25-colector-aviso-escrituras-paradas.md):
`/health` del colector dice `degraded`, un chequeo cada 10 min con mensaje completo y notificación de
escritorio. Lo que sigue abierto es un aviso que no dependa del portátil de Angelo.
