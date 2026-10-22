# La aritmetica de uptime no prueba que un flag no este cargado

**Sintoma.** Se edita una variable en `/opt/vio-analytics/.env` y despues se quiere saber si el
proceso la tiene. Dos mediciones de `uptime_s` separadas N minutos cuadran exactamente con N
(626 s + 86 min = 5776 s). Se concluye "es el mismo proceso, no ha reiniciado, el flag no esta
cargado" y se pide un `systemctl restart`.

**Causa real.** La conclusion confunde dos afirmaciones:
- "no ha reiniciado **desde mi primera medicion**" (lo que prueba la aritmetica), y
- "no ha reiniciado **desde que se edito el `.env`**" (lo que hace falta saber).

Si el reinicio ocurrio ANTES de la primera medicion, la aritmetica cuadra igual y el flag si esta
cargado. Es lo que paso el 22/10: el `.env` se escribio y la unit se reinicio en la misma pasada
(19:47:40 staging / 19:48:41 prod), y la primera medicion fue ~10 min despues.

**Como se comprueba de verdad, sin tocar nada.**

1. **El flag en el proceso vivo** — vale porque la unit usa `EnvironmentFile`, asi que la variable
   entra en el exec y queda en `/proc/<pid>/environ` (inmutable, no la toca `dotenv`):
   ```bash
   PID=$(systemctl show -p MainPID --value vio-analytics)
   sudo tr '\0' '\n' < /proc/$PID/environ | grep MIXPANEL_IDENTITY
   ```
   OJO: si la variable la cargara solo `dotenv` desde el fichero, **no** apareceria ahi aunque
   estuviera activa (`dotenv` escribe `process.env` en memoria). Aqui funciona por el
   `EnvironmentFile` de la unit.

2. **Cuando arranco vs cuando se edito el fichero** — si el `mtime` del `.env` coincide con el
   segundo del arranque, fue una pasada edicion+restart:
   ```bash
   stat -c '%y %n' /opt/vio-analytics/.env
   sudo journalctl -u vio-analytics --no-pager | grep -E 'Started|Stopped' | tail
   ```

3. **Prueba funcional, no de configuracion** — para la identidad de Mixpanel, mirar los eventos
   que YA se reenviaron:
   ```bash
   curl -s -u "$MIXPANEL_API_SECRET:" \
     "https://data-eu.mixpanel.com/api/2.0/export?from_date=$(date +%F)&to_date=$(date +%F)"
   ```
   Con `simplified` cada evento de navegador trae `$device_id` y `distinct_id: "$device:<anon>"`.
   Con `off` trae el id anonimo crudo y sin `$device_id`. Esto responde la pregunta de verdad
   ("¿se comporta como simplified?"), no solo "¿esta la variable?".

**Lo que si es cierto del reporte.** No hay forma de contestar "¿que configuracion corre?" con un
`curl` desde fuera: `/health` expone `enabled/buffered/forwarded/dropped/lastError` del sink, pero
ni la version del codigo ni el modo de identidad. Exponer `identity` y un `version`/`commit` es
barato y evita este genero de deduccion. Es un cambio de codigo: no se cuela en una ventana de
congelacion sin decidirlo.
