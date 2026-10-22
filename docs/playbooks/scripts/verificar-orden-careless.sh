#!/usr/bin/env bash
# Verifica, SOLO LECTURA, que una orden creada por Vio llego a la Shopify de Careless
# (dignitycollect.myshopify.com) con la linea de envio correcta y que Packrooster actuo.
#
#   ./verificar-orden-careless.sh              -> ordenes DE VIO para Careless (ancla: base de Vio)
#   ./verificar-orden-careless.sh '#554326CL'  -> por nombre de orden de Shopify
#   ./verificar-orden-careless.sh 18950684541180 -> por id de Shopify
#   ./verificar-orden-careless.sh --web [N]    -> ultimas N ordenes de SU TIENDA (ruido, ver nota)
#
# POR QUE EL MODO POR DEFECTO MIRA LA BASE DE VIO Y NO LA TIENDA:
# medido el 22/10, Careless hace ~58 ordenes/hora en su web (250 en 4h19m, todas source_name=web).
# Una orden espontanea de Vio queda sepultada en minutos, asi que "las ultimas N de la tienda" no
# sirve para encontrarla. El ancla fiable es Vio: order_item.supplier_shopify_order_id guarda el id
# de Shopify que devolvio el alta, y solo se escribe si el alta funciono.
#
# Como funciona: saca el access_token vivo de shopify_connection (prod) desde el pod de users y
# consulta la Admin API 2024-04. No escribe nada, ni en la base ni en Shopify.
# Requiere kubectl apuntando al cluster de PRODUCCION.
set -euo pipefail

POD=$(kubectl get pods -n default -o name | grep -m1 '^pod/users-' | cut -d/ -f2)
[ -n "$POD" ] || { echo "no hay pod de users"; exit 1; }

TMP=$(mktemp /tmp/chk-careless-XXXX.js)
cat > "$TMP" <<'EOF'
const mysql=require('mysql2/promise');
require('dotenv').config({path:'/usr/src/app/.env'});
const SHOP='dignitycollect.myshopify.com', V='2024-04', SUPPLIER=1327;
const mode=process.argv[2]||'', extra=process.argv[3]||'';
(async()=>{
const c=await mysql.createConnection({host:process.env.DB_HOST,user:process.env.DB_USERNAME,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,ssl:{rejectUnauthorized:false}});
const [r]=await c.query("select access_token,currency from shopify_connection where url=? and deleted_at is null order by id desc limit 1",[SHOP]);
if(!r.length){console.error('sin conexion viva para '+SHOP);process.exit(2);}
const tok=r[0].access_token, shopCurrency=r[0].currency;
const g=async(u)=>{const res=await fetch(u,{headers:{'X-Shopify-Access-Token':tok,'Content-Type':'application/json'}});
 if(!res.ok){console.error('HTTP',res.status,(await res.text()).slice(0,200));process.exit(3);} return res.json();};

const verShopify=async(o,vio)=>{
  const mf=(await g(`https://${SHOP}/admin/api/${V}/orders/${o.id}/metafields.json`)).metafields||[];
  const ff=(await g(`https://${SHOP}/admin/api/${V}/orders/${o.id}/fulfillments.json`)).fulfillments||[];
  const fo=(await g(`https://${SHOP}/admin/api/${V}/orders/${o.id}/fulfillment_orders.json`)).fulfillment_orders||[];
  console.log(`  shopify ${o.name} id=${o.id} ${o.created_at} total=${o.total_price} ${o.currency}`);
  console.log(`   source_name=${o.source_name}  financial=${o.financial_status} fulfillment=${o.fulfillment_status||'unfulfilled'}`);
  console.log('   shipping_lines:', JSON.stringify((o.shipping_lines||[]).map(s=>({title:s.title,code:s.code,source:s.source,price:s.price}))));
  console.log('   metafields:', JSON.stringify(mf.map(m=>`${m.namespace}.${m.key}`)));
  console.log('   fulfillments:', JSON.stringify(ff.map(f=>({status:f.status,company:f.tracking_company,n:f.tracking_number}))));
  const TPL=67699867900; // 360 Logistics (Drobak) — el 3PL de Careless
  const locs=fo.map(f=>Number(f.assigned_location_id));
  console.log('   fulfillment_orders:', JSON.stringify(fo.map(f=>({status:f.status,req:f.request_status,loc:f.assigned_location_id}))));
  const al3pl=locs.length>0&&locs.every(l=>l===TPL);
  console.log(`   asignada_al_3PL=${locs.length===0?'sin fulfillment_order':(al3pl?'OK (360 Logistics)':'NO -> '+locs.join(','))}`);
  if(locs.length&&!al3pl) console.log('    OJO: el fulfillment_order NO esta en 360 Logistics, asi que el 3PL no la ve. Suele ser stock de esa variante fuera del almacen.');
  const sl=(o.shipping_lines||[])[0];
  const esVio=/vio_order_id/.test(JSON.stringify(o.note_attributes||[]))||/^(channel:|outshifter)/.test(o.source_name||'');
  const ok1=!!sl, ok2=!!(sl&&sl.source==='Packrooster'), ok3=mf.some(m=>m.namespace==='packrooster'), ok4=ff.length>0;
  console.log(`   creada_por_vio=${esVio?'SI':'no (orden nativa de su web)'}`);
  console.log(`   VEREDICTO: linea_envio=${ok1?'OK':'FALTA'} source_Packrooster=${ok2?'OK':'NO'} metafield_packrooster=${ok3?'OK':'NO'} despachada=${ok4?'OK':'NO'}`);
  // --- CADENA DE LA CAPTURA DE VIPPS (captureMode=shipment) ---
  // El aviso de envio llega por webhook declarado por el app (Pub/Sub, topic vio-sync) y
  // extensions.receiveOrderFulfilled tiene que poder volver de la orden de Shopify a la de Vio.
  // Para eso exige DOS cosas en la orden (getOrderIdFromShopifyOrder): `note` no vacio Y el
  // metafield <SHOPIFY_NAMESPACE>.outshifter-order-id. Ese metafield lo pone un PUT POSTERIOR
  // al alta: si ese PUT fallo, la orden existe, se despacha... y la reserva de Vipps no se
  // captura nunca, en silencio. Esto es lo que hay que mirar.
  const NS='outshifter-qa'; // SHOPIFY_NAMESPACE del .env de extensions en prod
  const mfOrderId=mf.find(m=>m.namespace===NS&&m.key==='outshifter-order-id');
  const okNote=!!(o.note&&o.note.trim());
  const enlace=okNote&&!!mfOrderId;
  console.log(`   CAPTURA: note=${okNote?'OK':'VACIO'} metafield_order_id=${mfOrderId?('OK -> vio '+mfOrderId.value):'FALTA'} enlace_shopify->vio=${enlace?'OK':'ROTO'}`);
  if(!enlace&&esVio)
    console.log('    OJO: sin enlace, el orders/fulfilled NO encuentra la orden de Vio y la reserva de Vipps no se captura. Capturar a mano: POST /checkout/payment/vipps/order/<vioOrderId>/shipped (idempotente).');
  if(vio){
    const [tr]=await c.query('select slug,tracking_number,created_at from order_tracking where order_id=? and deleted_at is null order by id desc limit 1',[vio.vio_id]);
    console.log(`   tracking_en_vio=${tr.length?`OK (${tr[0].slug||'sin slug'} ${tr[0].tracking_number})`:'todavia no'}  <- cuando aparece, ya corrio saveTrackingNumber y con el la captura`);
  }
  const edad=Math.round((Date.now()-new Date(o.created_at).getTime())/1000);
  if(!ok3&&edad<60) console.log(`    (metafield: la orden tiene ${edad}s y Packrooster tarda 8-20s en ponerlo — volve a correr el guion, no es fallo)`);
  if(!ok4) console.log('    (despachada=NO con la orden recien creada es LO ESPERADO: nace authorized y sin fulfillments. Solo es fallo si sigue asi horas despues)');
  // precio de envio: solo comparable si la orden de Vio y la tienda estan en la misma moneda
  if(vio&&sl){
    const mismaMoneda=(vio.currency||'')===shopCurrency;
    const dif=Math.abs(Number(sl.price)-Number(vio.shipping_price));
    if(mismaMoneda&&dif>0.01)
      console.log(`    OJO precio de envio: Vio ${vio.shipping_price} ${vio.currency} -> Shopify ${sl.price} ${o.currency}. No cuadra.`);
    else if(!mismaMoneda)
      console.log(`    precio de envio convertido: Vio ${vio.shipping_price} ${vio.currency} -> Shopify ${sl.price} ${o.currency} (tienda en ${shopCurrency}; revisar a mano que el cambio sea sensato)`);
  }
};

if(mode==='--web'){
  const n=Number(extra)||3;
  console.log(`ULTIMAS ${n} ORDENES DE SU TIENDA (mayoria web; ~58/h — este modo NO sirve para buscar una orden de Vio)`);
  const orders=(await g(`https://${SHOP}/admin/api/${V}/orders.json?status=any&limit=${n}`)).orders;
  for(const o of orders){console.log('='.repeat(64)); await verShopify(o,null);}
  await c.end(); return;
}

if(mode){
  const q=/^\d+$/.test(mode)?`ids=${mode}`:`name=${encodeURIComponent(mode)}`;
  const orders=(await g(`https://${SHOP}/admin/api/${V}/orders.json?status=any&${q}`)).orders;
  if(!orders.length){console.log('sin ordenes para ese criterio');await c.end();return;}
  for(const o of orders){console.log('='.repeat(64)); await verShopify(o,null);}
  await c.end(); return;
}

// modo por defecto: ancla en la base de Vio
const [rows]=await c.query(
 `select o.id vio_id, o.created_at, o.channel, o.channel_order_name, o.currency,
         o.shipping_title, o.shipping_code, o.shipping_price, o.price_amount,
         o.payment_processor, o.test_origen,
         i.id item_id, i.status, i.status_detail, i.status_reason, i.supplier_shopify_order_id
    from \`order\` o join order_item i on i.order_id=o.id
   where i.supplier_id=? and o.deleted_at is null and i.deleted_at is null
   order by o.created_at desc limit 20`,[SUPPLIER]);
if(!rows.length){
  console.log(`VIO: todavia NO hay ninguna orden para Careless (supplier ${SUPPLIER}) en la base de prod.`);
  console.log('Si acabas de comprar y esto sigue vacio, el problema esta ANTES de Shopify (checkout/pago), no en el envio.');
  await c.end(); return;
}
const porOrden={};
for(const x of rows){ (porOrden[x.vio_id]=porOrden[x.vio_id]||[]).push(x); }
for(const vio_id of Object.keys(porOrden).sort((a,b)=>b-a)){
  const its=porOrden[vio_id], o=its[0];
  console.log('='.repeat(64));
  console.log(`VIO orden ${vio_id} ${new Date(o.created_at).toISOString()} canal=${o.channel||'-'} total=${o.price_amount||'-'} ${o.currency||''} pago=${o.payment_processor||'-'}${o.test_origen?' [TEST]':''}`);
  console.log(` envio que mando Vio: «${o.shipping_title||'-'}» code=${o.shipping_code||'-'} precio=${o.shipping_price} ${o.currency||''}`);
  const ids=[...new Set(its.map(i=>i.supplier_shopify_order_id).filter(Boolean))];
  console.log(` items: ${its.map(i=>`${i.item_id}:${i.status}${i.status_detail?'/'+i.status_detail:''}`).join(' ')}`);
  if(!ids.length){
    console.log(' SHOPIFY: sin supplier_shopify_order_id -> el alta en Shopify NO se completo.');
    console.log('  Motivo en los items:', JSON.stringify(its.map(i=>({status:i.status,detail:i.status_detail,reason:i.status_reason}))));
    console.log('  Donde mirar: kubectl logs -n default -l app=extensions -c extensions --since=1h | grep -i "shopifyService.createOrder\\|handleOrderPaid"');
    console.log('  (createOrder corre dentro de un Promise.all sin try/catch propio: si Shopify rechaza, queda en el log y esta columna en null)');
    continue;
  }
  for(const sid of ids){
    const o2=(await g(`https://${SHOP}/admin/api/${V}/orders.json?status=any&ids=${sid}`)).orders[0];
    if(!o2){console.log(` SHOPIFY: id ${sid} guardado en Vio pero la orden no aparece en la tienda`);continue;}
    await verShopify(o2,o);
  }
}
await c.end();
})().catch(e=>{console.error('ERR',e.message);process.exit(1)});
EOF

DEST="chk-careless-$$.js"
kubectl cp "$TMP" "default/$POD:/usr/src/app/$DEST" -c users >/dev/null
trap 'kubectl exec -n default "$POD" -c users -- rm -f "/usr/src/app/$DEST" >/dev/null 2>&1 || true; rm -f "$TMP"' EXIT
kubectl exec -n default "$POD" -c users -- sh -c "cd /usr/src/app && node $DEST '${1:-}' '${2:-}'"
