#!/usr/bin/env bash
# Verifica, SOLO LECTURA, que una orden de Careless (dignitycollect.myshopify.com)
# llego a Shopify con la linea de envio correcta y que Packrooster actuo sobre ella.
#
#   ./verificar-orden-careless.sh              -> las 3 ultimas ordenes de la tienda
#   ./verificar-orden-careless.sh '#554326CL'  -> por nombre de orden
#   ./verificar-orden-careless.sh 18950684541180 -> por id de Shopify
#
# Como funciona: saca el access_token vivo de shopify_connection (prod) desde el pod
# de users y consulta la Admin API 2024-04 de Careless. No escribe nada, ni en la
# base ni en Shopify. Requiere kubectl apuntando al cluster de PRODUCCION.
set -euo pipefail

POD=$(kubectl get pods -n default -o name | grep -m1 '^pod/users-' | cut -d/ -f2)
[ -n "$POD" ] || { echo "no hay pod de users"; exit 1; }

TMP=$(mktemp /tmp/chk-careless-XXXX.js)
cat > "$TMP" <<'EOF'
const mysql=require('mysql2/promise');
require('dotenv').config({path:'/usr/src/app/.env'});
const SHOP='dignitycollect.myshopify.com', V='2024-04';
const arg=process.argv[2]||null;
(async()=>{
const c=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});
const [r]=await c.query("select access_token from shopify_connection where url=? and deleted_at is null order by id desc limit 1",[SHOP]);
await c.end();
if(!r.length){console.error('sin conexion viva para '+SHOP);process.exit(2);}
const tok=r[0].access_token;
const g=async(u)=>{const res=await fetch(u,{headers:{'X-Shopify-Access-Token':tok,'Content-Type':'application/json'}});
 if(!res.ok){console.error('HTTP',res.status,(await res.text()).slice(0,200));process.exit(3);} return res.json();};
let orders;
if(arg){ const q=/^\d+$/.test(arg)?`ids=${arg}`:`name=${encodeURIComponent(arg)}`;
  orders=(await g(`https://${SHOP}/admin/api/${V}/orders.json?status=any&${q}`)).orders; }
else orders=(await g(`https://${SHOP}/admin/api/${V}/orders.json?status=any&limit=3`)).orders;
if(!orders.length){console.log('sin ordenes para ese criterio');return;}
for(const o of orders){
  const mf=(await g(`https://${SHOP}/admin/api/${V}/orders/${o.id}/metafields.json`)).metafields||[];
  const ff=(await g(`https://${SHOP}/admin/api/${V}/orders/${o.id}/fulfillments.json`)).fulfillments||[];
  console.log('='.repeat(64));
  console.log(`orden ${o.name} id=${o.id} ${o.created_at} total=${o.total_price} ${o.currency}`);
  console.log(` source_name=${o.source_name}  tags=${o.tags||'-'}`);
  console.log(` note=${(o.note||'-').slice(0,70)}`);
  console.log(` financial=${o.financial_status} fulfillment=${o.fulfillment_status||'unfulfilled'}`);
  console.log(' shipping_lines:', JSON.stringify((o.shipping_lines||[]).map(s=>({title:s.title,code:s.code,source:s.source,price:s.price}))));
  console.log(' metafields:', JSON.stringify(mf.map(m=>`${m.namespace}.${m.key}`)));
  console.log(' fulfillments:', JSON.stringify(ff.map(f=>({status:f.status,company:f.tracking_company,n:f.tracking_number}))));
  const sl=(o.shipping_lines||[])[0];
  const esVio=/^channel:/.test(o.source_name||'')||/vio_order_id/.test(JSON.stringify(o.note_attributes||[]));
  const ok1=!!sl, ok2=!!(sl&&sl.source==='Packrooster'), ok3=mf.some(m=>m.namespace==='packrooster'), ok4=ff.length>0;
  console.log(` creada_por_vio=${esVio?'SI':'no (orden nativa de su web)'}`);
  console.log(` VEREDICTO: linea_envio=${ok1?'OK':'FALTA'} source_Packrooster=${ok2?'OK':'NO'} metafield_packrooster=${ok3?'OK':'NO'} despachada=${ok4?'OK':'NO'}`);
  const edad=Math.round((Date.now()-new Date(o.created_at).getTime())/1000);
  if(!ok3&&edad<60) console.log(`   (metafield: la orden tiene ${edad}s y Packrooster tarda 8-20s en ponerlo — volve a correr el guion, no es fallo)`);
  if(!ok4) console.log('   (despachada=NO con la orden recien creada es LO ESPERADO: nace authorized y sin fulfillments. Solo es fallo si sigue asi horas despues)');
}
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
EOF

DEST="chk-careless-$$.js"
kubectl cp "$TMP" "default/$POD:/usr/src/app/$DEST" -c users >/dev/null
trap 'kubectl exec -n default "$POD" -c users -- rm -f "/usr/src/app/$DEST" >/dev/null 2>&1 || true; rm -f "$TMP"' EXIT
kubectl exec -n default "$POD" -c users -- sh -c "cd /usr/src/app && node $DEST '${1:-}'"
