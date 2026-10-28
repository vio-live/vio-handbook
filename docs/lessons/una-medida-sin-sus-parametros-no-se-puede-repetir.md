# Una medida sin sus parámetros apuntados no se puede repetir

**Síntoma.** El 27/10 frené un PR con una medida: tres rutas, 2,4x más lentas. Al día siguiente, con el
arreglo puesto, **no podía comparar**: ni el handoff ni el journal apuntaron con qué `client_app_id`,
`sponsor_id` ni rango se habían pedido esas rutas, ni si fue por TLS o contra `localhost`. Las cifras
servían para frenar, no para verificar el arreglo.

**Causa real.** Anoté el resultado y el mecanismo, no el **procedimiento**. Una cifra de latencia sin sus
parámetros es una anécdota: cambia con el tenant, el rango, el volumen y si hay red de por medio.

**Cómo se arregla.** Cuando una medida vaya a decidir algo (frenar, aprobar, comparar después):

1. Apuntar el comando entero, con parámetros y endpoint, no solo el resultado.
2. Decir contra qué se mide (`localhost:<puerto>` o el dominio público — el TLS y la red se cuelan en el número).
3. Número de pasadas y **mediana**, no la mejor ni la media.
4. Si no está apuntado y hay que volver a comparar: **medir las dos versiones en la misma sesión**, no fiarse
   de la cifra vieja. Desplegar la vieja, medir, desplegar la nueva, medir. Cuesta un cuarto de hora y es la
   diferencia entre una opinión y un dato.

Ejemplo del 28/10: midiendo las dos en el mismo rato, el «2,4x» resultó ser **+18 %** — el 2,4x era de otra
versión (`a60cc57`), no del arreglo.
