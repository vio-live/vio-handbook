#!/bin/bash
# FASE VENTANA — ESTO CORTA EL SERVICIO. Cada paso pide confirmacion.
# Uso: ./01-ventana.sh            (interactivo, paso a paso)
set -uo pipefail
cd "$(dirname "$0")/.."
K="kubectl --context vio-sc"
KP="kubectl --context vio-commerce-prod"
SVCS=(api base-api collections extensions graph-ql middleware orders payment-processors products shopcart templates tracking users)
IP_SC=135.116.206.152
Z=d8ebb16763e96258028487006145eb9c
: "${CF_DNS_TOKEN:?exporta CF_DNS_TOKEN}"

paso () { echo; echo "=================================================="; echo "PASO $1"; echo "=================================================="
  read -rp "  ejecutar? [s/N] " r; [[ "$r" == "s" ]] || { echo "  saltado"; return 1; }; return 0; }

paso "1. directResponse de Istio: 200 a los webhooks de Woo durante la ventana" && {
  $KP get vs virtual-service-reachu-prod-base-api -n istio-system -o yaml > rollback/vs-base-api-antes-corte.yaml
  echo "  VirtualService guardado en rollback/vs-base-api-antes-corte.yaml"
  python3 - <<'PY'
import subprocess, yaml
d = yaml.safe_load(open('rollback/vs-base-api-antes-corte.yaml'))
regla = {'name':'ventana-corte-woo',
         'match':[{'uri':{'exact':'/woo/webhooks'},'method':{'exact':'POST'}}],
         'directResponse':{'status':200,'body':{'string':'{"ok":true}'}}}
d['spec']['http'].insert(0, regla)   # PRIMERA: Istio toma la que matchea primero
for k in ('resourceVersion','uid','creationTimestamp','generation'): d['metadata'].pop(k, None)
d.get('metadata',{}).pop('managedFields', None)
open('/tmp/vs-corte.yaml','w').write(yaml.safe_dump(d))
subprocess.run(['kubectl','--context','vio-commerce-prod','apply','-f','/tmp/vs-corte.yaml'], check=True)
PY
  echo "  verificando que responde 200 sin llegar al pod:"
  curl -s -o /dev/null -w "    POST /woo/webhooks -> %{http_code}\n" -X POST --max-time 10 https://api-ecom.vio.live/woo/webhooks
}

paso "2. PARAR LOS WRITERS en Noruega (empieza la caida)" && {
  for s in "${SVCS[@]}"; do $KP scale deploy "$s" --replicas=0 >/dev/null; done
  echo -n "  esperando a 0 pods"; while [ "$($KP get pods --no-headers | grep -c Running)" != "0" ]; do echo -n .; sleep 5; done; echo " listo"
  date -u +"  writers detenidos: %H:%M:%SZ"
}

paso "3. delta final de blobs" && ./copy-blobs.sh

paso "4. verificar lag 0 y PROMOVER la replica (IRREVERSIBLE)" && {
  az mysql flexible-server replica stop-replication -n vio-ecom-db-prod-sc -g rg-vio-databases --yes -o none
  az mysql flexible-server show -n vio-ecom-db-prod-sc -g rg-vio-databases --query "{state:state,role:replicationRole}" -o tsv
}

paso "5. rotar contrasena y cerrar el acceso publico del server nuevo" && {
  NEWPW="$(python3 -c 'import secrets,string;a=string.ascii_letters+string.digits;print("".join(secrets.choice(a) for _ in range(32)))')"
  az mysql flexible-server update -n vio-ecom-db-prod-sc -g rg-vio-databases --admin-password "$NEWPW" -o none
  umask 077; echo "$NEWPW" > rollback/db-sc-password.txt
  echo "  contrasena nueva guardada en rollback/db-sc-password.txt (chmod 600, NO commitear)"
  az mysql flexible-server firewall-rule list -n vio-ecom-db-prod-sc -g rg-vio-databases -o tsv --query "[].name" | sed 's/^/    regla: /'
  echo "  >> revisar que NO exista AllowAll. Si aparece, borrarla aca."
}

paso "6. generar los .env de produccion y montarlos" && {
  PW=$(cat rollback/db-sc-password.txt)
  python3 - "$PW" <<'PY'
import sys, pathlib, re
pw = sys.argv[1]
p = pathlib.Path.home()/"vio-migracion"/"patch-env.py"
s = p.read_text()
s = re.sub(r'("(?:DB|TYPEORM)_PASSWORD":\s*)"[^"]*"', lambda m: m.group(1)+f'"{pw}"', s)
p.write_text(s); print("  patch-env.py actualizado con la contrasena nueva")
PY
  python3 patch-env.py --with-storage           # genera envs/sc-<svc>.env (SIN --test-profile)
  for s in "${SVCS[@]}"; do
    $K create secret generic "env-sc-$s" --from-file=.env="envs/sc-$s.env" --dry-run=client -o yaml | $K apply -f - >/dev/null
    $K patch deploy "$s" --type=json -p "[{\"op\":\"replace\",\"path\":\"/spec/template/spec/volumes/0/secret/secretName\",\"value\":\"env-sc-$s\"}]" >/dev/null
  done
  echo "  13 secrets de produccion creados y montados"
}

paso "7. escalar Suecia a replicas normales" && { ./escalar-corte.sh; sleep 20; $K get deploy --no-headers | awk '{printf "  %s=%s\n",$1,$2}'; }

paso "8. reactivar el CronJob shopcart-reconcile" && $K patch cronjob shopcart-reconcile -p '{"spec":{"suspend":false}}'

paso "9. VERIFICAR antes de tocar DNS (./02-verificar.sh)" && ./corte/02-verificar.sh

paso "10. DNS a Suecia (3 records)" && {
  for name in api-ecom.vio.live graph-ql.vio.live api-commerce.vio.live; do
    id=$(curl -s -H "Authorization: Bearer $CF_DNS_TOKEN" "https://api.cloudflare.com/client/v4/zones/$Z/dns_records?name=$name&type=A" | python3 -c "import json,sys;r=json.load(sys.stdin)['result'];print(r[0]['id'] if r else '')")
    curl -s -X PATCH -H "Authorization: Bearer $CF_DNS_TOKEN" -H "Content-Type: application/json" \
      "https://api.cloudflare.com/client/v4/zones/$Z/dns_records/$id" -d "{\"content\":\"$IP_SC\"}" \
      | python3 -c "import json,sys;d=json.load(sys.stdin);print('    '+('OK ' if d['success'] else 'FALLO ')+'$name')"
  done
}

paso "11. Front Door: origin del CDN a containerproductionsc (MISMA ventana que el paso 6)" && {
  az afd origin update --profile-name prod-cdn -g prod-reachu \
    --origin-group-name prod-cdn-reachu-Default \
    --origin-name containerproduction2-blob-core-windows-net \
    --host-name containerproductionsc.blob.core.windows.net \
    --origin-host-header containerproductionsc.blob.core.windows.net -o none
  echo "  origin actualizado. Verificar una imagen nueva por https://container.vio.live/..."
}

paso "12. quitar el directResponse de Istio y reparar webhooks de Woo" && {
  kubectl --context vio-commerce-prod apply -f rollback/vs-base-api-antes-corte.yaml
  echo "  VirtualService restaurado. Ahora correr el guard en un pod de Suecia:"
  echo "    node guard-woo-webhooks.js repair"
}

echo; echo "VENTANA TERMINADA. Correr ./corte/02-verificar.sh una vez mas y vigilar 30 min."
