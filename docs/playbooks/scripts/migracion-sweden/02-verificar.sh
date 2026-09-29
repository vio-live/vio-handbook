#!/bin/bash
# Verificacion del corte. NO cierra la ventana si algo falla o si algo NO SE PUDO MEDIR.
# Regla: "Ready" no vale. Se exige socket a la DB nueva y CERO a Noruega.
# Regla 2: no poder medir es un FALLO, no un OK. (Un 502 del kubelet dejaba la IP vacia
#          y la version anterior de este script daba OK con todo en cero.)
set -uo pipefail
K="kubectl --context vio-sc"
FAIL=0
# ENSAYO=1 -> acepta read_only=1 (replica todavia no promovida). Usar solo en ensayos.
SVCS=(api base-api collections extensions graph-ql middleware orders payment-processors products shopcart templates tracking users)
SIN_DB=(graph-ql)   # no tiene config de DB: nunca va a tener socket a MySQL

die () { echo "!! $1"; FAIL=1; }
tiene_db () { for x in "${SIN_DB[@]}"; do [ "$x" = "$1" ] && return 1; done; return 0; }

echo "== IP de la DB nueva (resuelta localmente, no desde un pod) =="
IP=""
for i in 1 2 3; do
  IP=$(python3 -c "import socket;print(socket.gethostbyname('vio-ecom-db-prod-sc.mysql.database.azure.com'))" 2>/dev/null) && [ -n "$IP" ] && break
  sleep 2
done
if ! [[ "$IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "!! NO SE PUDO RESOLVER LA IP DE LA DB. Sin esto no se puede verificar nada."; exit 1
fi
HEX=$(python3 -c "print(''.join(f'{int(o):02X}' for o in reversed('${IP}'.split('.'))))")
[ ${#HEX} -eq 8 ] || { echo "!! hex invalido ($HEX)"; exit 1; }
echo "   $IP  (hex $HEX)   |  Noruega 10.224.0.4 = 0400E00A"

echo "== replicas deseadas vs listas =="
for s in "${SVCS[@]}"; do
  want=$($K get deploy "$s" -o jsonpath='{.spec.replicas}' 2>/dev/null)
  have=$($K get deploy "$s" -o jsonpath='{.status.readyReplicas}' 2>/dev/null)
  have=${have:-0}
  if [ -z "$want" ]; then die "$s: no existe el deployment"; continue; fi
  if [ "$want" = "0" ]; then die "$s: escalado a 0 (no deberia durante el corte)"; continue; fi
  if [ "$want" != "$have" ]; then die "$s: $have/$want listas"; else printf "   %-20s %s/%s\n" "$s" "$have" "$want"; fi
done

echo "== prueba ACTIVA de DB, pod por pod =="
echo "   Cada pod lee SU PROPIO .env montado y se conecta a la DB que ese archivo dice."
echo "   No depende de trafico, ni de rutas HTTP, ni de cuanto lleva vivo el pod."
SC="$(dirname "$0")/selfcheck.js"
for s in "${SVCS[@]}"; do
  pods=$($K get pods -l app.kubernetes.io/name="$s" --field-selector=status.phase=Running \
          -o go-template='{{range .items}}{{if not .metadata.deletionTimestamp}}{{.metadata.name}} {{end}}{{end}}' 2>/dev/null)
  [ -z "$pods" ] && { die "$s: sin pods Running"; continue; }
  for p in $pods; do
    $K cp "$SC" "$p:/tmp/selfcheck.js" >/dev/null 2>&1 || { die "$p: no se pudo copiar el selfcheck"; continue; }
    out=$($K exec "$p" -- node /tmp/selfcheck.js 2>&1 | tail -1)
    nor=$($K exec "$p" -- grep -c '0400E00A:0CEA' /proc/net/tcp 2>/dev/null | tr -d '\r\n ')
    [[ "$nor" =~ ^[0-9]+$ ]] || nor="?"
    case "$out" in
      OK*)      [[ "$out" == *"prod-sc"* ]] || { die "$p: conecta, pero NO a la DB de Suecia -> $out"; }
                if [ "${ENSAYO:-0}" = "1" ]; then
                  [[ "$out" == *"read_only=1"* ]] && out="$out  (read_only esperado: modo ENSAYO)"
                else
                  [[ "$out" == *"read_only=0"* ]] || die "$p: la DB responde en READ_ONLY (falta promover la replica)"
                fi ;;
      SIN_DB*)  [ "$s" = "graph-ql" ] || die "$p: dice SIN_DB y no es graph-ql" ;;
      "")       die "$p: el selfcheck no devolvio nada" ;;
      *)        die "$p: $out" ;;
    esac
    [ "$nor" != "0" ] && die "$p: tiene socket abierto a NORUEGA"
    printf "   %-42s nor=%-3s %s\n" "$p" "$nor" "$out"
  done
done

echo "== lectura real que devuelve datos (no /health-check) =="
P=$($K get pods -l app.kubernetes.io/name=base-api -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
[ -z "$P" ] && die "sin pod de base-api para lanzar las pruebas" || {
OUT=$($K exec "$P" -- node -e "
const http=require('http');
const t=[['base-api','/api/channels'],['users','/1325']];
(async()=>{for(const [s,p] of t){await new Promise(r=>{
  http.get({host:s,port:80,path:p,timeout:12000},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>{console.log(s+p+'|'+res.statusCode+'|'+b.slice(0,40).replace(/\n/g,''));r()})})
   .on('error',e=>{console.log(s+p+'|ERR|'+e.message);r()})})}})();" 2>/dev/null)
echo "$OUT" | sed 's/^/   /'
echo "$OUT" | grep -q '|200|' || die "las lecturas reales no devolvieron 200"
[ "$(echo "$OUT" | grep -c '|200|')" = "2" ] || die "no todas las lecturas reales dieron 200"
}

echo "== reinicios =="
R=$($K get pods --no-headers 2>/dev/null | grep -v prepull | awk '{s+=$4} END {print s+0}')
echo "   total: $R"
[ "$R" != "0" ] && echo "   (preexistente o nuevo? comparar contra el valor de antes del corte)"

echo "== apps custom de Shopify en TODOS los pods de extensions =="
for p in $($K get pods -l app.kubernetes.io/name=extensions -o jsonpath='{.items[*].metadata.name}'); do
  cfg=$($K logs "$p" --tail=400 2>/dev/null | grep -c 'apps custom configuradas')
  bad=$($K logs "$p" --tail=400 2>/dev/null | grep -c 'Invalid API key')
  printf "   %-42s config=%s  InvalidAPIKey=%s\n" "$p" "$cfg" "$bad"
  [ "$cfg" = "0" ] && die "$p sin la linea de apps custom: VIO_CUSTOM_APPS no llego"
  [ "$bad" != "0" ] && die "$p con Invalid API key"
done

echo "== por el ingress de Suecia =="
for h in api-ecom.vio.live graph-ql.vio.live; do
  c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -k --resolve "$h:443:135.116.206.152" "https://$h/health-check")
  echo "   $h -> $c"
done
c=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -k --resolve "api-ecom.vio.live:443:135.116.206.152" "https://api-ecom.vio.live/api/channels")
echo "   api-ecom.vio.live/api/channels -> $c"; [ "$c" = "200" ] || die "el ingress no sirve datos"

echo
if [ "$FAIL" = "0" ]; then echo "VERIFICACION OK"; else echo "!! HAY FALLOS O COSAS SIN MEDIR: NO cerrar la ventana, evaluar rollback"; fi
exit $FAIL
