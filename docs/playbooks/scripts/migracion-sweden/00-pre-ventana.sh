#!/bin/bash
# FASE PRE-VENTANA — sin impacto, correr el dia anterior o la misma manana.
# No promueve nada, no corta nada. Idempotente.
set -euo pipefail
cd "$(dirname "$0")/.."
K="kubectl --context vio-sc"
KP="kubectl --context vio-commerce-prod"
SVCS=(api base-api collections extensions graph-ql middleware orders payment-processors products shopcart templates tracking users)

echo "== 1. TTL de DNS a 60s (Cloudflare) =="
TOK="${CF_DNS_TOKEN:?exporta CF_DNS_TOKEN con el token DNS de TOOLS.md}"
Z=d8ebb16763e96258028487006145eb9c
for name in api-ecom.vio.live graph-ql.vio.live api-commerce.vio.live; do
  id=$(curl -s -H "Authorization: Bearer $TOK" \
    "https://api.cloudflare.com/client/v4/zones/$Z/dns_records?name=$name&type=A" \
    | python3 -c "import json,sys;r=json.load(sys.stdin)['result'];print(r[0]['id'] if r else '')")
  [ -z "$id" ] && { echo "   !! $name no encontrado"; continue; }
  curl -s -X PATCH -H "Authorization: Bearer $TOK" -H "Content-Type: application/json" \
    "https://api.cloudflare.com/client/v4/zones/$Z/dns_records/$id" -d '{"ttl":60}' \
    | python3 -c "import json,sys;d=json.load(sys.stdin);print('   '+('OK  ' if d['success'] else 'FALLO ')+'$name ttl='+str(d['result']['ttl'] if d['success'] else d['errors']))"
done

echo "== 2. precarga de imagenes en los nodos =="
$K apply -f prepull-daemonset.yaml >/dev/null
$K rollout status ds/prepull-images --timeout=15m
echo "   imagenes por nodo:"
for n in $($K get nodes -o jsonpath='{.items[*].metadata.name}'); do
  c=$($K get node "$n" -o json | python3 -c "import json,sys;d=json.load(sys.stdin);print(len({i['names'][0] for i in d['status'].get('images',[]) if any('reachuprod2' in x for x in i.get('names',[]))}))")
  echo "     $n: $c/13"
done

echo "== 3. baseline de webhooks de WooCommerce =="
$KP exec "$($KP get pods -l app.kubernetes.io/name=base-api -o jsonpath='{.items[0].metadata.name}')" -- \
  node /usr/src/app/guard-woo-webhooks.js check || echo "   (copiar guard-woo-webhooks.js a /usr/src/app del pod primero)"

echo "== 4. lag de la replica =="
$KP exec "$($KP get pods -l app.kubernetes.io/name=base-api -o jsonpath='{.items[0].metadata.name}')" -- \
  env H=vio-ecom-db-prod-sc.mysql.database.azure.com P="${DB_PASS:?exporta DB_PASS}" node /usr/src/app/lag.js

echo; echo "PRE-VENTANA COMPLETA. Nada se corto."
