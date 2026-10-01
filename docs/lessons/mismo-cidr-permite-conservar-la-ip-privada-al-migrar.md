---
title: Si las dos VNets comparten CIDR, se puede conservar la IP privada al migrar de región y DB_HOST no cambia
last-updated: 2026-10-01
---

## Síntoma
Al mudar un cluster de región, el paso más frágil del corte es repuntar la base de datos. Si la app
conecta por private endpoint, `DB_HOST` es una IP privada de la VNet vieja, y en el destino "toca"
inyectar un valor nuevo por Secret o reconstruir la imagen. Ese paso es el que hizo **revertir el
corte de producción del 29/09**: los servicios no tomaban el `DB_HOST` nuevo.

## Causa real
No siempre hace falta cambiar nada. AKS crea su VNet gestionada con un CIDR **por defecto**
(`10.224.0.0/12`, subred de nodos `10.224.0.0/16`). Dos clusters creados con esos defaults, en
regiones distintas, tienen **el mismo espacio de direcciones**. Y un private endpoint admite IP
privada **estática**.

O sea que el endpoint del destino puede nacer con **exactamente la misma IP** que el del origen, y
entonces `DB_HOST` no cambia: ni Secret, ni `envFrom`, ni rebuild, ni riesgo de que la próxima imagen
vuelva a hornear el valor viejo.

## Cómo se hace
Comprobar primero que la IP está libre en la VNet destino:

```bash
az network vnet check-ip-address -g MC_<rg>_<cluster>_<region> -n <vnet> --ip-address 10.224.0.7
# -> { "available": true, "isPlatformReserved": false }
```

Crearlo con la IP clavada (`--ip-config ... private-ip-address=`):

```bash
az network private-endpoint create -g <rg> -n db-staging-sc -l <region> \
  --subnet "<id-subred-aks>" \
  --private-connection-resource-id "<id-del-mysql>" --group-id mysqlServer \
  --connection-name db-staging-sc-conn \
  --ip-config name=ipconf group-id=mysqlServer member-name=mysqlServer private-ip-address=10.224.0.7
```

Verificar que quedó `Static`, no `Dynamic`:

```bash
az network nic show --ids "$(az network private-endpoint show -g <rg> -n db-staging-sc \
  --query 'networkInterfaces[0].id' -o tsv)" \
  --query "ipConfigurations[].{ip:privateIPAddress, metodo:privateIPAllocationMethod}" -o table
```

## Dos condiciones de orden que no son opcionales

**1. La base tiene que estar arrancada.** Contra un servidor detenido falla:

```
(ServerNotInSucceededState) Server '<nombre>' is not in succeeded state.
```

Hay que arrancarla, crear el endpoint y volver a apagarla. El endpoint **sobrevive** al apagado
(`Approved` / `Succeeded`).

**2. Hay que crearlo con el cluster APAGADO.** Los nodos toman las primeras IPs de la subred
(`.4`, `.5`, y `.6` el tercero si hay autoescala). Si el cluster arranca antes, puede quedarse la IP
que necesitas y el truco se pierde para siempre. Reservarla con el endpoint mientras el cluster está
detenido es lo que lo garantiza.

## Verificación que vale
Que el endpoint exista no prueba nada. Hay que hacer el handshake desde **dentro** de la VNet nueva:

```bash
kubectl --context <cluster-nuevo> run pe-test --rm -i --restart=Never --image=mysql:8.0 \
  --env="MYSQL_PWD=$PASS" --command -- \
  mysql -h 10.224.0.7 -u <user> -e "SELECT VERSION(), @@hostname, @@ssl_cipher;"
```

Si devuelve versión, hostname del servidor y cifrado TLS, el camino es real.

## Nota
Conectar por IP implica que el certificado del servidor no casa por hostname. Funciona porque el
cliente no verifica el nombre (`ssl-mode=PREFERRED`), que es como está hoy en producción. No es un
cambio de postura: es la misma que ya había.

## Relacionado
- `lessons/el-env-esta-horneado-en-la-imagen-no-en-el-blob.md`
- `playbooks/migracion-staging-a-sweden-central.md`
