---
title: Un lock CanNotDelete en un servidor bloquea también el borrado de sus reglas de firewall
last-updated: 2026-10-02
---

## Síntoma
Querés borrar una regla de firewall de un Flexible Server y Azure contesta con un error que habla del
servidor, no de la regla:

```
(ScopeLocked) The scope '.../flexibleServers/vio-ecom-db-prod-sc/firewallRules/all'
cannot perform delete operation because following scope(s) are locked:
'.../flexibleServers/vio-ecom-db-prod-sc'
```

## Causa real
Un lock `CanNotDelete` sobre el servidor se hereda a **todos sus recursos hijos**, y una regla de
firewall es un recurso hijo. El lock que pusiste para que nadie borre la base por error también impide
quitarle un `0.0.0.0/0`.

## Cómo hacerlo
Retirar el lock, hacer el cambio, **reponerlo en el mismo bloque de comandos** y verificar aparte:

```bash
NOTA="<la nota original, copiada tal cual>"
az lock delete --name no-borrar -g <rg> --resource-name <srv> \
  --resource-type flexibleServers --namespace Microsoft.DBforMySQL
az mysql flexible-server firewall-rule delete -g <rg> -n <srv> --rule-name all --yes
az lock create --name no-borrar -g <rg> --resource-name <srv> \
  --resource-type flexibleServers --namespace Microsoft.DBforMySQL \
  --lock-type CanNotDelete --notes "$NOTA"
az lock list -g <rg> --resource-name <srv> --resource-type flexibleServers \
  --namespace Microsoft.DBforMySQL -o table      # el lock tiene que volver a aparecer
```

Copiar la nota del lock **antes** de borrarlo: se va con él, y es lo que explica a los demás por qué
está ahí.

## Y de paso: `cmd -o none 2>&1 && echo "hecho"` miente
El intento fallido se dio por bueno porque el comando era:

```bash
az ... firewall-rule delete ... -o none 2>&1 && echo "  borrada"
```

Imprimió `borrada` **habiendo fallado**. Lo que salvó la situación fue listar las reglas después, en un
paso aparte, y ver que `all` seguía ahí.

**No confirmar un cambio con el `echo` que va detrás del comando.** Confirmarlo releyendo el estado con
otro comando. Mismo principio que [[feedback_verificar_con_objeto_existente]].

## Relacionado
- [Un día en el que borraste recursos no sirve para leer run-rate](dia-con-borrados-no-sirve-para-run-rate.md)
