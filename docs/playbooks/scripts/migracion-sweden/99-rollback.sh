#!/bin/bash
# ROLLBACK. Sirve COMPLETO solo si NO se promovio la replica (paso 4 de 01-ventana.sh).
# Despues de promover, volver a Noruega pierde lo escrito en Suecia.
set -uo pipefail
cd "$(dirname "$0")/.."
echo "1. DNS de vuelta a Noruega (20.100.174.93)"
Z=d8ebb16763e96258028487006145eb9c
for name in api-ecom.vio.live graph-ql.vio.live api-commerce.vio.live; do
  id=$(curl -s -H "Authorization: Bearer ${CF_DNS_TOKEN:?}" "https://api.cloudflare.com/client/v4/zones/$Z/dns_records?name=$name&type=A" | python3 -c "import json,sys;r=json.load(sys.stdin)['result'];print(r[0]['id'] if r else '')")
  curl -s -X PATCH -H "Authorization: Bearer $CF_DNS_TOKEN" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$Z/dns_records/$id" -d '{"content":"20.100.174.93"}' >/dev/null
  echo "   $name -> 20.100.174.93"
done
echo "2. Front Door de vuelta a containerproduction2"
az afd origin update --profile-name prod-cdn -g prod-reachu --origin-group-name prod-cdn-reachu-Default \
  --origin-name containerproduction2-blob-core-windows-net \
  --host-name containerproduction2.blob.core.windows.net \
  --origin-host-header containerproduction2.blob.core.windows.net -o none
echo "3. Suecia a 0"
for s in api base-api collections extensions graph-ql middleware orders payment-processors products shopcart templates tracking users; do
  kubectl --context vio-sc scale deploy "$s" --replicas=0 >/dev/null; done
echo "4. Noruega de vuelta a sus replicas"
kubectl --context vio-commerce-prod scale deploy api --replicas=2; kubectl --context vio-commerce-prod scale deploy base-api --replicas=4
kubectl --context vio-commerce-prod scale deploy collections --replicas=2; kubectl --context vio-commerce-prod scale deploy extensions --replicas=2
kubectl --context vio-commerce-prod scale deploy graph-ql --replicas=2; kubectl --context vio-commerce-prod scale deploy middleware --replicas=3
kubectl --context vio-commerce-prod scale deploy orders --replicas=2; kubectl --context vio-commerce-prod scale deploy payment-processors --replicas=2
kubectl --context vio-commerce-prod scale deploy products --replicas=2; kubectl --context vio-commerce-prod scale deploy shopcart --replicas=2
kubectl --context vio-commerce-prod scale deploy templates --replicas=1; kubectl --context vio-commerce-prod scale deploy tracking --replicas=3
kubectl --context vio-commerce-prod scale deploy users --replicas=2
echo "5. quitar el directResponse de Istio"
[ -f rollback/vs-base-api-antes-corte.yaml ] && kubectl --context vio-commerce-prod apply -f rollback/vs-base-api-antes-corte.yaml
echo "6. reparar webhooks de Woo:  node guard-woo-webhooks.js repair  (desde un pod de base-api de Noruega)"
