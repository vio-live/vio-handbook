---
date: 2026-11-05
session: Colector de analytics a 6b14e5c0 en staging y prod (Miguel)
participants: [angelo, claude, miguel]
status: live
---

## Qué se pidió

Angelo, por el canal de coordinación (`b611ccc`, 23:40): desplegar
[vio-analytics #43](https://github.com/vio-live/vio-analytics/pull/43) en producción y staging «en
cuanto lo veas», para que claude pueda regenerar el PDF de Faves del 5/11 con la venta real.

El PR ya estaba **mergeado**; lo que faltaba era solo el despliegue, que en este repo es **manual
por SSH a las dos VMs** (no hay CD desde que se desmanteló el Vio Backend en Azure).

## Qué arregla

`05a3ec90`: la SDK web manda a veces el `purchase` de vuelta de Vipps con valor 0 y sin líneas (el
carrito ya no existe). El colector lo tomaba como la compra del pedido por compartir la clave, y lo
que cobró Commerce (`order_paid`) quedaba fuera de gmv, unidades y productos. Son los pedidos de
Faves 4136, 4139 y 4142: **819 NOK que no salían en el dashboard**.

Es un fix de **lectura** (`src/stats-paid-orders.ts`), así que surte efecto en cuanto corre: no hay
que reingestar nada.

## Resultado, medido

Antes: `d2f4adb5` en las dos VMs. Después: **`6b14e5c0`** en las dos, `ready:true`,
`clickhouse.lastError: null`, sin avisos en journalctl.

La prueba que importa, no el `/health`:

```
GET /v1/stats/campaigns/4/funnel?client_app_id=1&range=7d
→ purchases: 8, gmv: 2946, sessions: 405, purchase_sessions: 4
```

**2.946 NOK**, que es justo la cifra que claude esperaba. Antes el funnel sumaba 1.817.

## El playbook está mal: el `tar` necesita `sudo`

El comando documentado (`cd /tmp && tar xzf anl.tgz -C /opt/vio-analytics`) **falló**: parte del
árbol es de `root` (82 ficheros, `src/` entero) y `ubuntu` no puede sobrescribirlos.

Lo peor es **cómo** falla: los ficheros de `ubuntu` SÍ se escriben y los de `root` no, así que deja
el árbol **medio actualizado**. En mi caso `package.json` ya era el nuevo y `src/` el viejo. El
servicio siguió sano porque el `dist` no se había reconstruido, pero un `pnpm build` encima de eso
habría mezclado versiones sin avisar.

Arreglado en las dos VMs: extracción con `sudo` y después `chown -R ubuntu:ubuntu`, así que el
árbol queda homogéneo y el comando del playbook ya funcionará tal cual la próxima vez.
PR para corregir el playbook: [vio-analytics#44](https://github.com/vio-live/vio-analytics/pull/44).

## Error mío, detectado antes de romper nada

Al unificar la propiedad hice `chown root:root` sobre el `.env` **suponiendo** que era de root. Era
de `ubuntu`, y **el servicio corre como `ubuntu`** (`systemctl show -p User`): con el `.env` en
`root:root` y permisos 600 el colector no habría podido leerlo y habría arrancado sin configuración.

Lo vi y lo devolví a `ubuntu:ubuntu` 600 **antes del reinicio**, comprobando con `md5sum -c` que el
contenido seguía intacto. Lección: antes de tocar la propiedad de un fichero de configuración, mirar
como qué usuario corre el servicio que lo lee.

## Respaldos

Árbol previo de cada VM, sin `node_modules`:
`/opt/vio-analytics-backup-pre-6b14e5c0-20261105-2243xx.tgz` (staging) y `-2245xx.tgz` (prod).
El `.env` no se tocó en ninguna: md5 verificado antes y después en las dos.
