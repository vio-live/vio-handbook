# La prueba gratuita de una nube caduca y se lleva lo que no es gratis

**Síntoma.** El 23/11/2026 a las 09:10 UTC la VM de ClickHouse de analytics dejó de contestar. No estaba
parada ni rota: **ya no existía**. En la consola de Oracle solo quedaban las otras dos instancias.

**Causa real.** La tenancy `vio-backend` se abrió el 25/09/2026 con la prueba gratuita y sin medio de pago.
Sobre ella se montaron dos VMs `E2.1.Micro` (Always Free) y, después, la de ClickHouse en
`VM.Standard.E5.Flex`, que **es de pago**: funcionaba con los créditos de la prueba. La prueba acabó el 24/10
y, a los 30 días, Oracle retiró la instancia (las fechas cuadran; el aviso de Oracle no se ha visto). El
documento de infraestructura decía «Costo: 0 USD/mes (Always Free)» y era verdad para las otras dos máquinas,
no para esta.

Lo que salvó los datos fue suerte de diseño, no previsión: el **boot volume sobrevivió** (50 GB, dentro del
cupo gratuito) y el colector retuvo dos días de eventos en memoria porque nadie lo reinició.

**Regla.**

- Al crear un recurso en una cuenta en prueba, mirar si su forma es *Always Free* o si vive de los créditos.
  Si vive de créditos, tiene fecha de caducidad aunque nadie la haya apuntado.
- Una cuenta que sostiene producción lleva **medio de pago y presupuesto con aviso** desde el primer día.
- La IP efímera se pierde con la instancia: lo que tenga un DNS delante va con **IP reservada**.
- El dato que vive en el disco de arranque necesita **copia programada**, y saber cómo se restaura.
- «Cuesta 0» en un documento es una afirmación sobre recursos concretos: nombrar cuáles.

**Cómo se comprueba.** Consola de Oracle → Billing → Subscriptions (plan y fecha) y Compute → Instances (la
etiqueta *Always Free* al lado del nombre). Límites del cupo: Governance → Limits.

**Qué se hizo.** Journal
[2026-11-25-clickhouse-caida-fin-prueba-oracle](../journal/2026-11/2026-11-25-clickhouse-caida-fin-prueba-oracle.md):
cuenta en Pay As You Go, instancia recreada desde el mismo disco, IP reservada, copia diaria y semanal del
disco y presupuesto mensual con avisos. Cómo se opera hoy:
[playbook de analytics](../playbooks/operate-vio-analytics.md#clickhouse-vm-de-oracle-por-ssh).
