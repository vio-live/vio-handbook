#!/usr/bin/env bash
# Verificacion de la primera hora del go-live (Careless x Aller, lunes 26/10).
# Solo LECTURA: no cambia nada en prod. Pensado para pegar y correr tal cual.
#
# Requisitos:
#   - contexto kubectl `vio-commerce-prod-sc` (el cluster de prod)
#   - ANALYTICS_READ_TOKEN con el token de SOLO LECTURA del colector de prod
#     (vive en TOOLS.md del workspace de Miguel; NO se guarda en el handbook)
#
# Uso:
#   ANALYTICS_READ_TOKEN=... ./verificacion-golive-lunes.sh
#   ANALYTICS_READ_TOKEN=... ./verificacion-golive-lunes.sh --con-db   # anade las consultas a la base

set -uo pipefail

CTX=vio-commerce-prod-sc
NS=default
CARELESS_USER=1327   # marca (sponsor) — su payment_method es el que cobra
ALLER_USER=1330      # publisher — su channel es el que ensena el boton de Vipps
MSN=1179558          # unidad de venta de Careless en Vipps
CON_DB=0
[[ "${1:-}" == "--con-db" ]] && CON_DB=1

ok=0; warn=0; bad=0
pass(){ printf '  \033[32mOK\033[0m   %s\n' "$1"; ok=$((ok+1)); }
flag(){ printf '  \033[33mOJO\033[0m  %s\n' "$1"; warn=$((warn+1)); }
fail(){ printf '  \033[31mMAL\033[0m  %s\n' "$1"; bad=$((bad+1)); }
sec(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

echo "Verificacion go-live — $(date '+%Y-%m-%d %H:%M:%S %Z')"

# ---------------------------------------------------------------- D4. Infra
sec "D4. Infra de prod"
if ! kubectl --context "$CTX" get ns "$NS" >/dev/null 2>&1; then
  fail "no hay acceso al cluster $CTX (si el API server no resuelve, el cluster esta Stopped)"
else
  total=$(kubectl --context "$CTX" get deploy -n "$NS" --no-headers | wc -l | tr -d ' ')
  listos=$(kubectl --context "$CTX" get deploy -n "$NS" -o json \
    | python3 -c 'import json,sys; d=json.load(sys.stdin)["items"]; print(sum(1 for x in d if x["status"].get("readyReplicas",0)==x["spec"]["replicas"]))')
  if [[ "$listos" == "$total" && "$total" == "14" ]]; then pass "$listos/$total deployments con todas sus replicas listas"
  elif [[ "$listos" == "$total" ]]; then flag "$listos/$total listos, pero esperaba 14 deployments"
  else
    fail "$listos/$total deployments listos"
    kubectl --context "$CTX" get deploy -n "$NS" --no-headers | awk '$2!~/^([0-9]+)\/\1$/{print "       -",$1,$2}'
  fi

  # reinicios: un pod que se reinicia solo es la senal temprana de un crash loop
  rs=$(kubectl --context "$CTX" get pods -n "$NS" --no-headers 2>/dev/null \
       | awk '$4>0{printf "%s(%s) ",$1,$4}')
  [[ -z "$rs" ]] && pass "ningun pod con reinicios" || flag "pods con reinicios: $rs"

  # `/` tiene que dar 200 (gateway + middleware vivos) y `/api/users` 401 (el micro responde y
  # la autenticacion corre). Un 502/503 en cualquiera de los dos = Istio sin destino sano.
  raiz=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api-ecom.vio.live/)
  usr=$(curl -s -o /dev/null -w '%{http_code}' -m 15 https://api-ecom.vio.live/api/users)
  [[ "$raiz" == "200" ]] && pass "api-ecom.vio.live/ responde 200" || fail "api-ecom.vio.live/ responde $raiz"
  [[ "$usr" == "401" ]] && pass "api-ecom.vio.live/api/users responde 401 (el micro contesta)" \
                        || fail "api-ecom.vio.live/api/users responde $usr (esperaba 401)"
fi

# ------------------------------------------------- D1. Webhook de Vipps
sec "D1. Webhook de Vipps en shopcart (lo unico que prueba la firma por la red)"
SC=$(kubectl --context "$CTX" get pods -n "$NS" -l app.kubernetes.io/instance=shopcart \
     -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
if [[ -z "$SC" ]]; then
  fail "no encuentro pods de shopcart"
else
  # Las pruebas que hice el 22/10 se llaman `vio-probe-*` y aparecen rechazadas a proposito
  # (las mande sin cabeceras de firma). Se excluyen: no son entregas de Vipps.
  rech=0; acep=0; otros=0
  for p in $SC; do
    L=$(kubectl --context "$CTX" logs -n "$NS" "$p" -c shopcart --since=24h --tail=200000 2>/dev/null \
        | grep '\[vippsEvent\]' | grep -v 'vio-probe-')
    rech=$(( rech + $(printf '%s' "$L" | grep -c 'refused:') ))
    acep=$(( acep + $(printf '%s' "$L" | grep -cE 'AUTHORIZED|CAPTURED|REFUNDED|CANCELLED' | head -1) ))
    otros=$(( otros + $(printf '%s' "$L" | grep -c 'is not an ePayment event') ))
  done
  if [[ "$rech" -gt 0 ]]; then
    fail "$rech eventos de Vipps RECHAZADOS — el secreto del registro no es el que tiene shopcart"
    echo "       el registro vivo es e1de7656-76e2-4871-b23b-2c54119bc7b3 (scope partner, forAllSalesUnits)"
    echo "       la propia linea del log dice host, path y cuantos secretos se probaron"
    echo "       re-registrar: POST /checkout/register/webhook/vipps {\"scope\":\"partner\"} desde el pod,"
    echo "       y copiar el secreto a TOOLS.md EN LA MISMA PASADA (Vipps solo lo ensena al registrar)"
    for p in $SC; do kubectl --context "$CTX" logs -n "$NS" "$p" -c shopcart --since=24h --tail=200000 2>/dev/null \
      | grep '\[vippsEvent\]' | grep -v 'vio-probe-' | grep 'refused:' | tail -3 | sed 's/^/       /'; done
  elif [[ "$acep" -gt 0 ]]; then
    pass "eventos de Vipps aceptados y ninguno rechazado (la firma de produccion funciona)"
  else
    flag "todavia no ha llegado ningun evento real de Vipps (normal si no hubo pagos aun)"
  fi
  [[ "$otros" -gt 0 ]] && flag "$otros cuerpos que no son eventos de ePayment (sondas o ruido, no cobros)"
fi

# ------------------------------------------------- D2. Colector de analytics
sec "D2. Colector de analytics de prod"
H=$(curl -s -m 15 https://events.vio.live/health)
if [[ -z "$H" ]]; then
  fail "events.vio.live no responde (VM 82.70.54.151; systemctl status vio-analytics)"
else
  ins=$(printf '%s' "$H" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clickhouse"]["inserted"])' 2>/dev/null)
  err=$(printf '%s' "$H" | python3 -c 'import json,sys; print(json.load(sys.stdin)["clickhouse"]["lastError"] or "-")' 2>/dev/null)
  mix=$(printf '%s' "$H" | python3 -c 'import json,sys; s=json.load(sys.stdin)["sinks"]["mixpanel"]; print("%s fwd / %s drop / %s" % (s["forwarded"], s["dropped"], s["lastError"] or "-"))' 2>/dev/null)
  [[ "${ins:-0}" -gt 0 ]] && pass "inserted=$ins (dejo de ser 0: estan entrando eventos)" \
                          || flag "inserted=0 todavia (sin eventos aun; si hubo visitas, mirar el log)"
  [[ "$err" == "-" ]] && pass "ClickHouse sin lastError" || fail "ClickHouse lastError: $err"
  echo "       mixpanel: $mix"
  if [[ -n "${ANALYTICS_READ_TOKEN:-}" ]]; then
    for u in "$CARELESS_USER" "$ALLER_USER"; do
      O=$(curl -s -m 20 -H "x-internal-token: $ANALYTICS_READ_TOKEN" \
          "https://events.vio.live/v1/commerce-stats/overview?sponsor_id=$u")
      if printf '%s' "$O" | grep -q '"kpis"'; then
        printf '       user %s: %s\n' "$u" "$(printf '%s' "$O" | python3 -c 'import json,sys; k=json.load(sys.stdin)["kpis"]; print(" ".join("%s=%s" % (n, k[n]["value"]) for n in ("views","clicks","purchases","grossRevenue") if n in k))')"
      else
        flag "commerce-stats/overview del user $u no devuelve kpis: $(printf '%s' "$O" | head -c 120)"
      fi
    done
  else
    flag "sin ANALYTICS_READ_TOKEN: me salto las metricas por marca (el token esta en TOOLS.md)"
  fi
fi

# ------------------------------------------------- Base de datos (opcional)
if [[ "$CON_DB" == 1 ]]; then
  sec "Estado en la base (payment_method de Careless + switch del channel de Aller)"
  P=$(kubectl --context "$CTX" get pods -n "$NS" -l app.kubernetes.io/instance=users \
      -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [[ -z "$P" ]]; then
    fail "no encuentro pod de users para consultar la base"
  else
    cat > /tmp/golive-check.js <<'JS'
const fs=require('fs'),mysql=require('mysql2/promise');
const f=fs.existsSync('.env')?'.env':'.env.local';
const e={};for(const l of fs.readFileSync(f,'utf8').split('\n')){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);if(m)e[m[1]]=m[2].trim().replace(/^['"]|['"]$/g,'');}
const CARELESS=1327, ALLER=1330;
(async()=>{
const c=await mysql.createConnection({host:e.DB_HOST,port:+(e.DB_PORT||3306),user:e.DB_USERNAME,password:e.DB_PASSWORD,database:e.DB_NAME||'outshifter',ssl:{rejectUnauthorized:false}});
const q=async(s,p)=>(await c.execute(s,p||[]))[0];

// A2: la fila que hace que Careless cobre en SU unidad y no en la de Vio
const pm=await q("select id,active,options from payment_method where user_id=? and deleted_at is null",[CARELESS]);
if(!pm.length) console.log('payment_method: 0 filas para '+CARELESS+' -> Careless NO puede cobrar (A2 deshecho)');
for(const r of pm){let o={};try{o=JSON.parse(r.options)}catch(_){}
  console.log('payment_method '+r.id+' active='+r.active+' mode='+o.mode+' msn='+o.merchantSerialNumber+
    ' unit='+o.salesUnitName+' org='+o.salesUnitOrgNumber+' captureMode='+o.captureMode);
  if(o.mode!=='partner') console.log('  OJO: mode='+o.mode+' (tiene que ser partner; platform cobra a la cuenta de Vio)');
  if(o.merchantSerialNumber!=='1179558') console.log('  OJO: la MSN no es 1179558');}

// B3 / B3b: el channel del publisher y el interruptor de Vipps de ese channel
const ch=await q("select cu.id,cu.user_id,cu.channel_id,cu.custom_name,cu.active,s.vipps,s.klarna,s.adyen "+
  "from channel_user cu left join channel_user_settings s on s.id=cu.channel_user_settings_id where cu.deleted_at is null");
if(!ch.length) console.log('channel_user: 0 filas -> no hay channel (B3 abierto)');
for(const r of ch) console.log('channel_user '+r.id+' user='+r.user_id+' channel='+r.channel_id+
  ' "'+(r.custom_name||'')+'" active='+r.active+' vipps='+r.vipps+' klarna='+r.klarna+' adyen='+r.adyen+
  (r.user_id===ALLER&&r.vipps!=1?'  <- OJO: es el de Aller y vipps NO esta en 1 (B3b): sin boton de Vipps':''));

// B4: el catalogo que sirve el SDK sale SOLO de channel_user_products. channel_group /
// collection_shared resuelve la MARCA (pagos, campanas, dashboard); NO materializa el catalogo.
// Medido el 23/10: el channel 480 tenia vipps=1, la share puesta y 0 productos -> el boton de
// Vipps aparecia y no habia nada que comprar. `POST /channel/group` no llama al hook que
// materializa; `POST /channel/multi-group/v2` si. Esta comprobacion es el agujero que tenia
// este guion: daba 0 MAL con el catalogo vacio.
const cup=await q("select channel_user_id, count(*) n from channel_user_products where deleted_at is null group by channel_user_id");
const cupMap=new Map(cup.map(r=>[r.channel_user_id,Number(r.n)]));
for(const r of ch){
  if(r.user_id!==ALLER) continue;
  const n=cupMap.get(r.id)||0;
  console.log('channel_user_products del channel '+r.id+' (Aller): '+n+' producto(s) en el catalogo del SDK');
  if(n===0) console.log('  OJO: catalogo VACIO -> el SDK no muestra nada aunque Vipps si aparezca. '+
    'Arreglo (idempotente, micro products): POST /channel-process/collections/update {"collectionsId":["<idDeLaCollection>"]}');
}

// E1b: lo que el checkout le cobra de envio al comprador de Careless
const sh=await q("select s.id,s.name,s.amount,s.currency_code,s.`default`,sc.country,sc.amount as camount,sc.currency_code as ccur "+
  "from shipping s left join shipping_country sc on sc.shipping_id=s.id and sc.deleted_at is null "+
  "where s.user_id=? and s.deleted_at is null",[CARELESS]);
if(!sh.length) console.log('shipping: 0 filas para '+CARELESS+' -> el checkout puede fallar al calcular envio');
for(const r of sh){console.log('shipping "'+r.name+'" base='+r.amount+' '+r.currency_code+' default='+r.default+
  ' pais='+(r.country||'-')+' precio='+(r.camount||'-')+' '+(r.ccur||''));
  if(r.ccur&&r.ccur!=='NOK') console.log('  OJO: la tarifa por pais no esta en NOK ('+r.ccur+')');
  if(r.name==='Default Shipping') console.log('  OJO: sigue el placeholder del alta (E1b): faltan las tarifas reales de Careless');}

// A1: quien es Admin de equipo Vio, y quien es Publisher (role 3)
// Ojo con los nombres: la clave es `id_user_role`, no `id`; y en `role` es `id_role`.
const ur=await q("select ur.id_user_role,ur.user_id,ur.role_id_role,ur.active_user_role,r.role,u.username "+
  "from user_role ur left join role r on r.id_role=ur.role_id_role left join user u on u.id=ur.user_id");
if(!ur.length) console.log('user_role: VACIA -> nadie es Admin de equipo Vio (A1 deshecho)');
for(const r of ur) console.log('user_role '+r.id_user_role+' user='+r.user_id+' ('+r.username+') rol='+r.role+' active='+r.active_user_role);
if(!ur.some(r=>r.role_id_role===1&&r.active_user_role===1)) console.log('  OJO: ningun Admin activo -> nadie puede entrar a Vio team');

// La collection compartida tiene que apuntar a una cuenta VIVA (el 22/10 apuntaba a una borrada)
const cs=await q("select cs.id,cs.collection_id,cs.user_id,c.title,c.user_id as dueno,u.username,u.deleted_at "+
  "from collection_shared cs left join collection c on c.id=cs.collection_id left join user u on u.id=cs.user_id "+
  "where cs.deleted_at is null order by cs.created_at desc limit 5");
// Una share cuyo usuario esta borrado es residuo, no averia: lo que importa es que la collection
// tenga al menos una share VIVA. Las de usuarios borrados no se pueden quitar por el endpoint
// (el lookup excluye usuarios con deleted_at), y la app tampoco las ve.
const vivas=new Map();
for(const r of cs) if(!r.deleted_at) vivas.set(r.collection_id,(vivas.get(r.collection_id)||0)+1);
for(const r of cs){
  const nota = r.deleted_at
    ? '  (residuo: esa cuenta esta borrada; esta collection tiene '+(vivas.get(r.collection_id)||0)+' share(s) viva(s))'
    : '';
  console.log('collection_shared '+r.id+' "'+r.title+'" de '+r.dueno+' compartida con '+
    r.user_id+' ('+r.username+')'+nota);
  if(r.deleted_at && !(vivas.get(r.collection_id)>0))
    console.log('  OJO: la unica share de esta collection apunta a una cuenta BORRADA: el publisher no la ve');}
await c.end()})().catch(e=>{console.error('ERROR',e.message);process.exit(1)});
JS
    kubectl --context "$CTX" cp /tmp/golive-check.js "$NS/$P:/usr/src/app/golive-check.js" -c users >/dev/null 2>&1
    kubectl --context "$CTX" exec -n "$NS" "$P" -c users -- sh -c \
      'cd /usr/src/app && node golive-check.js; rm -f golive-check.js' 2>&1 | sed 's/^/       /'
    rm -f /tmp/golive-check.js
  fi
fi

sec "Resumen"
printf '  %s OK · %s OJO · %s MAL\n' "$ok" "$warn" "$bad"
echo "  D3 (el cobro visible en la unidad $MSN del portal de Vipps) solo lo puede ver Angelo."
[[ "$bad" -gt 0 ]] && exit 1 || exit 0
