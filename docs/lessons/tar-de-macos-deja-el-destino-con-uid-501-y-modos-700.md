---
title: Un tarball armado en macOS deja el destino con uid 501 y modos 700
last-updated: 2026-10-20
author: miguel
---

## Síntoma

Despliegas código en una VM Linux copiando un `.tgz` armado en la laptop (macOS) y extrayéndolo
con `sudo tar -xzf ... -C /opt/<servicio>`. La extracción "funciona" y el siguiente comando falla:

```
bash: line 2: cd: /opt/vio-analytics: Permission denied
grep: src/sinks/clickhouse.ts: Permission denied
```

Y con `sudo`, los ficheros aparecen con dueño numérico:

```
drwx------ 9 501 root 4096 Oct 20 11:08 .
-rw------- 1 501 root 1178 Oct 20 11:08 package.json
```

## Causa real

`tar -czf` guarda **uid/gid y modos** tal como están en el origen. En macOS el primer usuario es
**uid 501**, que en Linux no existe (`stat` lo enseña como `UNKNOWN`), y los ficheros del clon
venían con modos restrictivos. Al extraer **como root**, `tar` restaura ese uid y esos modos —
incluido el de la **entrada `./`**, que reescribe los permisos del directorio de destino. El
servicio sigue corriendo (sus ficheros ya estaban abiertos), pero el usuario normal pierde el
acceso al árbol y cualquier `pnpm install`/`pnpm build` posterior falla.

## Cómo se arregla / se evita

Al extraer, no restaurar ni dueño ni modos:

```bash
sudo tar -xzf /tmp/paquete.tgz -C /opt/<servicio> --no-same-owner --no-same-permissions
```

O armar el tarball ya normalizado:

```bash
tar --owner=0 --group=0 --mode='u+rw,go+r' -czf paquete.tgz .   # gtar
```

Si ya pasó, se recupera sin tocar el `.env`:

```bash
sudo chown -R <usuario-del-servicio>:<usuario-del-servicio> /opt/<servicio>
sudo find /opt/<servicio> -path /opt/<servicio>/node_modules -prune -o -type d -exec chmod 755 {} +
sudo find /opt/<servicio> -path /opt/<servicio>/node_modules -prune -o -type f -exec chmod 644 {} +
sudo chmod 600 /opt/<servicio>/.env /opt/<servicio>/.env.*
```

Comprobación que lo detecta antes de perder el rato: tras extraer, `stat -c "%U %G %a %n"` del
directorio raíz del servicio. Si el dueño sale numérico o `UNKNOWN`, es esto.
