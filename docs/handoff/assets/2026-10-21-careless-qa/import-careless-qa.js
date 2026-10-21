// Importa en QA los 5 productos de Careless, desde el export de prod
// (export-careless-prod.js) o, si no hay export, desde el JSON público de
// Shopify (SOURCE=shopify), con el mismo mapeo que hace products al importar
// de Shopify (vio-products-microservice, product.service.ts:1780-2351).
//
// Tres modos:
//  1) LOCAL, arma un script autocontenido (datos + este código) para mandar por stdin:
//       node import-careless-qa.js --bundle careless-5.json > run-import.js
//       node import-careless-qa.js --bundle shopify/          > run-import.js   (fallback Shopify)
//  2) LOCAL, muestra las filas que se insertarían, sin base:
//       node import-careless-qa.js --preview careless-5.json | shopify/
//  3) EN EL POD DE QA (lee /usr/src/app/.env.local):
//       kubectl --context kubernetesqa-sc -n default exec -i deploy/users -c users -- \
//         env QA_USER_ID=<id> QA_CHANNEL_ID=<id> DRY_RUN=1 node - < run-import.js
//     (también acepta `node - /ruta/careless-5.json` si el JSON ya está dentro del pod)
//
// Variables: QA_USER_ID (obligatoria), QA_CHANNEL_ID, DRY_RUN=1, SOURCE=export|shopify,
// QA_SHIPPING_ID, QA_SHIPPING_COUNTRIES (p. ej. "NO,SE"), QA_FORCE_STOCK, QA_DEFAULT_STOCK,
// QA_CURRENCY, QA_SHOP_DOMAIN, CATALOG_COUNTRY, ALLOW_MULTI_BRAND=1, LINK_EXISTING=1, ENV_FILE.
//
// Nunca imprime valores de .env. Idempotente: si el user de QA ya tiene un producto vivo con el
// mismo origin_id / shopify_id, lo salta. Una transacción por producto; ids nuevos siempre.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createRequire } = require('module');

const APP = '/usr/src/app';
const DEFAULT_SHOP = 'dignitycollect.myshopify.com';
const TARGETS = [
  { shopifyId: '9448742355196', handle: 'cassia-mid-jacket-brown' },
  { shopifyId: '9457686970620', handle: 'hennie-cardigan-beige' },
  { shopifyId: '9450415882492', handle: 'vilde-genser-chocolate-brown' },
  { shopifyId: '9438008672508', handle: 'sofie-genser-brun' },
  { shopifyId: '9438008770812', handle: 'active-teddy-jakke-brun' },
];

const log = (...a) => process.stderr.write(a.join(' ') + '\n');
const out = (...a) => process.stdout.write(a.join(' ') + '\n');
const env = process.env;
const truthy = (v) => v === '1' || v === 'true' || v === 'yes';

// ───────────────────────── mapeo (sin base) ─────────────────────────

function strip(row, keys) {
  for (const k of keys) delete row[k];
  return row;
}

// Igual que products: 16 caracteres [0-9a-zA-Z] y a mayúsculas (product.service.ts:2876-2884).
function generateSku() {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let s = '';
  for (let i = 0; i < 16; i++) s += chars[crypto.randomInt(chars.length)];
  return s.toUpperCase();
}

// Igual que product.channelUser.service.ts (cleanSpecialCharacteres).
function cleanSpecial(text) {
  return text
    ? String(text).replace(/﻿/g, ' ').replace(/★/g, ' ').replace(/̈/g, ' ').replace(/–/g, ' ').replace(/\u0096/g, ' ')
    : '';
}

const isWebpOrHeic = (url) => /\.(webp|heic)(\?|$)/i.test(String(url || ''));
const absUrl = (u) => (u && String(u).startsWith('//') ? `https:${u}` : u);
const urlKey = (u) => String(u || '').replace(/^https?:/, '').split('?')[0];
const money = (cents) => (cents == null ? null : (Math.round(Number(cents)) / 100).toFixed(2));

/**
 * Plan desde el export de prod: copia las filas tal cual, sin ids, y fija lo que
 * hace falta para que el producto se vea y se pueda comprar (status=1, active=1).
 */
function planFromExport(entry, sourceUserId) {
  const warnings = [];
  const p = { ...entry.product };
  const originId = String(p.origin_id || entry.shopifyId);
  const shopifyId = p.shopify_id != null ? String(p.shopify_id) : null;
  strip(p, ['id', 'created_at', 'updated_at', 'deleted_at', 'user_id']);
  Object.assign(p, { status: 1, active: 1, flat_rate_id: null, total_orders: null, total_imports: null, imported: null });
  if ('absent_runs' in p) p.absent_runs = 0;
  if ('content_hash' in p) p.content_hash = null;
  if (entry.info && entry.info.flatRate) warnings.push('tenía flat_rate en prod: no se copia (legacy, el envío va por product_shipping)');
  if ((entry.productAttributes || []).length) warnings.push(`${entry.productAttributes.length} product_attribute en prod: no se copian`);
  if (Number(entry.product.status) !== 1) warnings.push(`en prod status=${entry.product.status}; en QA queda 1 (publicado)`);
  if (Number(entry.product.active) !== 1) warnings.push(`en prod active=${entry.product.active}; en QA queda 1`);

  const variants = (entry.variants || []).map((v) => ({ key: String(v.id), row: strip({ ...v }, ['id', 'deleted_at', 'product_id']) }));
  const options = (entry.options || []).map((o) => strip({ ...o }, ['id', 'deleted_at', 'product_id']));
  const images = (entry.images || []).map((i) => ({
    productLevel: i.product_id != null && String(i.product_id) === String(entry.product.id),
    variantKey: i.variant_id != null ? String(i.variant_id) : null,
    row: strip({ ...i }, ['id', 'deleted_at', 'product_id', 'variant_id', 'created_at', 'updated_at']),
  }));
  const importedProducts = (entry.importedProducts || [])
    .filter((r) => String(r.user_id) === String(sourceUserId))
    .map((r) => strip({ ...r }, ['id', 'deleted_at', 'created_at', 'updated_at', 'product_id', 'user_id', 'channel_user_id']));
  const ps = (entry.productShipping || [])[0];
  return {
    handle: entry.handle,
    originId,
    shopifyId,
    product: p,
    variants,
    options,
    images,
    importedProducts,
    shippingDescription: ps ? ps.description || null : null,
    sourceShippingId: ps ? ps.shipping_id : null,
    categories: (entry.productCategories || []).map((r) => ({ name: r.category_name, slug: r.category_slug })).filter((r) => r.name),
    subcategories: (entry.productSubcategories || []).map((r) => r.subcategory_name).filter(Boolean),
    channels: (entry.productChannels || []).map((r) => r.channel_name).filter(Boolean),
    warnings,
  };
}

/**
 * Plan desde el JSON público de Shopify (formato products/<handle>.js), con el mismo
 * mapeo que products (transfromShopifyProduct + transformShopifyVariant). Lo que el
 * .js no trae se resuelve con opciones: stock (QA_DEFAULT_STOCK / QA_FORCE_STOCK),
 * moneda (QA_CURRENCY) y dominio de la tienda (QA_SHOP_DOMAIN).
 */
function planFromShopify(handle, json, opts) {
  const warnings = [];
  const sp = json.product || json;
  const vs = sp.variants || [];
  if (!vs.length) throw new Error(`${handle}: el JSON no trae variantes`);
  const optionsEnabled = vs.length > 1; // product.service.ts:1835
  const v0 = vs[0];
  const cur = opts.currency;
  const stockOf = (v) => (opts.forceStock != null ? opts.forceStock : v.available ? opts.defaultStock : 0);

  // Imágenes (1842-1938): todas las del producto por position; las que usa una variante
  // salen del producto y van a la variante.
  let media = (sp.media || []).filter((m) => (m.media_type || 'image') === 'image');
  if (!media.length) media = (sp.images || []).map((src, i) => ({ src, position: i + 1 }));
  let images = media
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((m) => ({ url: absUrl(m.src), width: m.width != null ? m.width : null, height: m.height != null ? m.height : null, order: (m.position || 1) - 1 }));
  const variantImageKeys = new Set(optionsEnabled ? vs.filter((v) => v.featured_image).map((v) => urlKey(v.featured_image.src)) : []);
  if (variantImageKeys.size) {
    const backup = images[0] || null;
    images = images.filter((img) => !variantImageKeys.has(urlKey(img.url))).map((img, i) => ({ ...img, order: i }));
    if (!images.length && sp.featured_image) images = [{ url: absUrl(sp.featured_image), width: null, height: null, order: 0 }];
    else if (!images.length && backup) images = [{ ...backup, order: 0 }];
  }
  const webp = images.filter((i) => isWebpOrHeic(i.url)).length;
  if (webp) warnings.push(`${webp} imagen(es) .webp/.heic: en prod products las sube a Azure como .jpg (reviewImages); acá queda la URL de Shopify`);

  // Variantes (1959-2040 y 1780-1829). Solo si hay más de una.
  const variants = [];
  if (optionsEnabled) {
    for (const v of vs) {
      const price = money(v.price);
      const vImages = [];
      if (v.featured_image && v.featured_image.src) {
        const u = absUrl(v.featured_image.src);
        vImages.push({ url: `${u}${u.includes('?') ? '&' : '?'}originId=${v.id}`, order: 0 });
      }
      variants.push({
        key: `shopify:${v.id}`,
        row: {
          sku: v.sku ? String(v.sku) : generateSku(), // 2172-2177
          title: (v.options || [v.option1, v.option2, v.option3].filter((x) => x != null)).join('-'), // convertVariantTitleByVariant
          barcode: v.barcode != null ? String(v.barcode) : null,
          quantity: stockOf(v),
          origin_id: String(v.id),
          price,
          price_amount: price,
          price_currency_code: cur,
          price_base_amount: price,
          price_compare_at: v.compare_at_price ? money(v.compare_at_price) : '0.00',
          active: 1,
          origin_data: null,
        },
        images: vImages,
      });
    }
  }

  const options = optionsEnabled
    ? (sp.options || []).map((o, i) =>
        typeof o === 'string'
          ? { name: o, order: i + 1, values: [...new Set(vs.map((v) => v[`option${i + 1}`]).filter((x) => x != null))].join(',') }
          : { name: o.name, order: o.position != null ? o.position : i + 1, values: (o.values || []).join(',') },
      )
    : [];

  // Precio del producto = el de la primera variante; si es 0, el mínimo > 0 (2313-2317).
  let price = money(v0.price);
  if (!(Number(price) > 0)) {
    const prices = vs.map((v) => Number(money(v.price))).filter((n) => n > 0);
    if (prices.length) price = Math.min(...prices).toFixed(2);
  }
  const quantity = optionsEnabled ? variants.reduce((s, v) => s + Number(v.row.quantity || 0), 0) : stockOf(v0);
  const product = {
    origin: 'SHOPIFY',
    origin_id: String(sp.id),
    origin_variant_id: optionsEnabled ? null : String(v0.id),
    title: sp.title,
    description: sp.description || null,
    sku: optionsEnabled ? generateSku() : v0.sku ? String(v0.sku) : generateSku(),
    barcode: optionsEnabled ? '' : v0.barcode != null ? String(v0.barcode) : null,
    quantity,
    // El .js da gramos; products guarda el `weight` de la API de Shopify (unidad de la tienda,
    // normalmente kg). Sin verificar contra prod.
    weight: v0.weight != null ? (Number(v0.weight) / 1000).toFixed(2) : null,
    public_price: price,
    price_amount: price,
    price_currency_code: cur,
    price_compare_at: !optionsEnabled && v0.compare_at_price ? money(v0.compare_at_price) : null,
    options_enabled: optionsEnabled ? 1 : 0,
    digital: v0.requires_shipping === false ? 1 : 0,
    origin_url: `https://${opts.shop}/products/${sp.handle || handle}`,
    status: 1,
    active: 1,
  };
  if (opts.forceStock == null) warnings.push(`stock inventado: el .js no trae inventario (available → ${opts.defaultStock}, agotado → 0)`);

  const allImages = images.map((row) => ({ productLevel: true, variantKey: null, row }));
  for (const v of variants) for (const row of v.images) allImages.push({ productLevel: false, variantKey: v.key, row });
  return {
    handle,
    originId: String(sp.id),
    shopifyId: null,
    product,
    variants: variants.map(({ key, row }) => ({ key, row })),
    options,
    images: allImages,
    importedProducts: [],
    shippingDescription: null,
    sourceShippingId: null,
    categories: [],
    subcategories: [],
    channels: [],
    warnings,
  };
}

function buildPlans(source, data, opts) {
  if (source === 'export') {
    if (!data || data.meta?.kind !== 'careless-prod-export') throw new Error('el JSON no es un export de export-careless-prod.js');
    for (const m of data.missing || []) log(`aviso: el export no trae ${m.handle} (${m.shopifyId})`);
    return data.products.map((entry) => planFromExport(entry, data.meta.sourceUserId));
  }
  const plans = [];
  for (const t of TARGETS) {
    const json = data[t.handle];
    if (!json) {
      log(`aviso: falta shopify/${t.handle}.json`);
      continue;
    }
    plans.push(planFromShopify(t.handle, json, opts));
  }
  return plans;
}

function readShopifyDir(dir) {
  const o = {};
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) o[f.replace(/\.json$/, '')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  return o;
}

function optsFromEnv() {
  const int = (v) => (v != null && v !== '' && /^\d+$/.test(v) ? Number(v) : null);
  return {
    currency: (env.QA_CURRENCY || 'NOK').toUpperCase(),
    shop: env.QA_SHOP_DOMAIN || DEFAULT_SHOP,
    defaultStock: int(env.QA_DEFAULT_STOCK) != null ? int(env.QA_DEFAULT_STOCK) : 10,
    forceStock: int(env.QA_FORCE_STOCK),
  };
}

function applyForceStock(plan, forceStock) {
  if (forceStock == null) return;
  for (const v of plan.variants) v.row.quantity = forceStock;
  plan.product.quantity = plan.variants.length ? forceStock * plan.variants.length : forceStock;
}

// ───────────────────────── modos locales ─────────────────────────

function localInput(p) {
  if (!p) throw new Error('falta la ruta: careless-5.json o la carpeta shopify/');
  return fs.statSync(p).isDirectory() ? { source: 'shopify', data: readShopifyDir(p) } : { source: 'export', data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function bundleMode(p) {
  const { source, data } = localInput(p);
  const self = fs.readFileSync(__filename, 'utf8');
  const header = source === 'export' ? `global.__CARELESS_DATA__ = ${JSON.stringify(data)};\n` : `global.__CARELESS_SHOPIFY__ = ${JSON.stringify(data)};\n`;
  process.stdout.write(header + self);
  log(`bundle ${source} listo (${source === 'export' ? `${data.products.length} productos` : `${Object.keys(data).length} JSON`})`);
}

function previewMode(p) {
  const { source, data } = localInput(p);
  const opts = optsFromEnv();
  const plans = buildPlans(source, data, opts);
  for (const plan of plans) applyForceStock(plan, opts.forceStock);
  out(JSON.stringify(plans, null, 1));
  for (const plan of plans) {
    log(`${plan.handle}: ${plan.product.title} | ${plan.product.price_amount} ${plan.product.price_currency_code} | v=${plan.variants.length} [${plan.variants.map((v) => `${v.row.title}:${v.row.sku}:${v.row.quantity}`).join(' ')}] | opt=${plan.options.length} | img=${plan.images.length}`);
    for (const w of plan.warnings) log(`   aviso: ${w}`);
  }
}

// ───────────────────────── modo pod (base de QA) ─────────────────────────

// SQL de vio-api-microservice/src/modules/channel/providers/brand-of-channel.ts (dueños de los
// productos que publica un channel, 5 parámetros = channel id) y los channels que venden a una
// cuenta (6 parámetros = user id).
const CHANNEL_PRODUCT_OWNERS_SQL = `
  SELECT DISTINCT p.user_id AS owner_id
  FROM (
    SELECT cg.product_id FROM \`channel_group\` cg
      WHERE cg.channel_user_id = ? AND cg.deleted_at IS NULL AND cg.product_id IS NOT NULL
    UNION
    SELECT v.product_id FROM \`channel_group\` cg
      JOIN \`variant\` v ON v.id = cg.variant_id AND v.deleted_at IS NULL
      WHERE cg.channel_user_id = ? AND cg.deleted_at IS NULL
    UNION
    SELECT ci.product_id FROM \`channel_group\` cg
      JOIN \`collection\` col ON col.id = cg.collection_id AND col.deleted_at IS NULL
      JOIN \`collection_item\` ci ON ci.collection_id = col.id AND ci.deleted_at IS NULL
      WHERE cg.channel_user_id = ? AND cg.deleted_at IS NULL
    UNION
    SELECT ci.product_id FROM \`channel_group\` cg
      JOIN \`collection_shared\` csh ON csh.id = cg.collection_shared_id AND csh.deleted_at IS NULL
      JOIN \`collection\` col ON col.id = csh.collection_id AND col.deleted_at IS NULL
      JOIN \`collection_item\` ci ON ci.collection_id = col.id AND ci.deleted_at IS NULL
      WHERE cg.channel_user_id = ? AND cg.deleted_at IS NULL
    UNION
    SELECT cup.product_id FROM \`channel_user_products\` cup
      WHERE cup.channel_user_id = ? AND cup.deleted_at IS NULL
  ) cp
  JOIN \`product\` p ON p.id = cp.product_id AND p.deleted_at IS NULL
  JOIN \`user\` b ON b.id = p.user_id AND b.deleted_at IS NULL`;

const CHANNELS_SELLING_ACCOUNT_SQL = `
  SELECT DISTINCT cu.id AS channel_user_id, cu.user_id AS owner_id
  FROM \`channel_user\` cu
  WHERE cu.deleted_at IS NULL AND (
    cu.user_id = ?
    OR cu.id IN (
      SELECT cg.channel_user_id FROM \`channel_group\` cg
        JOIN \`product\` p ON p.id = cg.product_id
        WHERE p.user_id = ? AND cg.deleted_at IS NULL
      UNION
      SELECT cg.channel_user_id FROM \`channel_group\` cg
        JOIN \`variant\` v ON v.id = cg.variant_id
        JOIN \`product\` p ON p.id = v.product_id
        WHERE p.user_id = ? AND cg.deleted_at IS NULL
      UNION
      SELECT cg.channel_user_id FROM \`channel_group\` cg
        JOIN \`collection_item\` ci ON ci.collection_id = cg.collection_id AND ci.deleted_at IS NULL
        JOIN \`product\` p ON p.id = ci.product_id
        WHERE p.user_id = ? AND cg.deleted_at IS NULL
      UNION
      SELECT cg.channel_user_id FROM \`channel_group\` cg
        JOIN \`collection_shared\` csh ON csh.id = cg.collection_shared_id
        JOIN \`collection_item\` ci ON ci.collection_id = csh.collection_id AND ci.deleted_at IS NULL
        JOIN \`product\` p ON p.id = ci.product_id
        WHERE p.user_id = ? AND cg.deleted_at IS NULL
      UNION
      SELECT cup.channel_user_id FROM \`channel_user_products\` cup
        JOIN \`product\` p ON p.id = cup.product_id
        WHERE p.user_id = ? AND cup.deleted_at IS NULL
    )
  )`;

const TABLES = [
  'product', 'variant', 'option', 'image', 'imported_product', 'product_shipping', 'shipping', 'shipping_country',
  'product_category', 'category', 'product_subcategories_subcategory', 'subcategory', 'product_channels_channel',
  'channel', 'channel_group', 'channel_user_products', 'channel_user',
];

class Abort extends Error {}

async function podMode(argPath) {
  // Datos: el bundle inyectado, o una ruta dentro del pod.
  let source = (env.SOURCE || '').toLowerCase();
  let data = null;
  if (global.__CARELESS_DATA__ && source !== 'shopify') { source = 'export'; data = global.__CARELESS_DATA__; }
  else if (global.__CARELESS_SHOPIFY__) { source = 'shopify'; data = global.__CARELESS_SHOPIFY__; }
  else if (argPath) { const li = localInput(argPath); source = li.source; data = li.data; }
  if (!data) throw new Abort('no hay datos: usá el bundle (--bundle) o pasá la ruta del JSON / carpeta shopify');
  if (env.SOURCE && env.SOURCE.toLowerCase() !== source) throw new Abort(`SOURCE=${env.SOURCE} pero los datos son de tipo ${source}`);

  const DRY = truthy(env.DRY_RUN);
  const QA_USER_ID = Number(env.QA_USER_ID);
  if (!Number.isInteger(QA_USER_ID) || QA_USER_ID <= 0) throw new Abort('QA_USER_ID es obligatorio (entero)');
  const opts = optsFromEnv();
  const catalogCountry = (env.CATALOG_COUNTRY || 'NO').toUpperCase();

  // Planes (puro, antes de tocar la base).
  const plans = buildPlans(source, data, opts);
  for (const plan of plans) applyForceStock(plan, opts.forceStock);
  if (!plans.length) throw new Abort('no hay productos para importar');

  // .env de QA. Por defecto SOLO .env.local (el de los pods de QA); el .env de prod no se lee.
  const appRequire = createRequire(path.join(APP, 'package.json'));
  const load = (name) => { try { return appRequire(name); } catch (_) { return require(name); } };
  const envFile = env.ENV_FILE || `${APP}/.env.local`;
  if (!fs.existsSync(envFile)) throw new Abort(`no existe ${path.basename(envFile)}: ¿es un pod de QA? (ENV_FILE para otra ruta)`);
  const original = console.log;
  console.log = () => {};
  try { load('dotenv').config({ path: envFile, quiet: true }); } finally { console.log = original; }
  const dbConf = {
    host: env.DB_HOST || env.TYPEORM_HOST,
    port: Number(env.DB_PORT || env.TYPEORM_PORT || 3306),
    user: env.DB_USERNAME || env.DB_USER || env.TYPEORM_USERNAME,
    password: env.DB_PASSWORD || env.TYPEORM_PASSWORD,
    database: env.DB_NAME || env.DB_DATABASE || env.TYPEORM_DATABASE,
    ssl: { rejectUnauthorized: false },
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: 'UTF8MB4_GENERAL_CI',
  };
  SECRETS.push(...[dbConf.host, dbConf.user, dbConf.password, dbConf.database].filter((v) => v && String(v).length >= 3).map(String));
  log(`env: ${path.basename(envFile)}; claves DB presentes: ${['host', 'user', 'password', 'database'].filter((k) => dbConf[k]).join(',')}`);
  log(`modo: ${DRY ? 'DRY_RUN (solo lectura)' : 'ESCRITURA'}; fuente: ${source}; user QA: ${QA_USER_ID}`);

  const mysql = load('mysql2/promise');
  const c = await mysql.createConnection(dbConf);
  CONN = c;
  if (DRY) await c.query('SET SESSION TRANSACTION READ ONLY');

  const sel = async (sql, params = []) => {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error('sel(): solo SELECT');
    const [rows] = await c.query(sql, params);
    return rows;
  };
  const selOpt = async (sql, params) => {
    try { return await sel(sql, params); } catch (err) {
      if (['ER_NO_SUCH_TABLE', 'ER_BAD_FIELD_ERROR'].includes(err.code)) return null;
      throw err;
    }
  };

  // Guardia: la base no puede ser la del export (prod).
  if (source === 'export' && data.meta.dbFingerprint) {
    let fp = null;
    for (const sql of ['SELECT @@server_uuid AS s, DATABASE() AS d', 'SELECT @@hostname AS s, DATABASE() AS d']) {
      try { const [r] = await sel(sql); fp = crypto.createHash('sha256').update(`${r.s}|${r.d}`).digest('hex').slice(0, 24); break; } catch (_) { /* siguiente */ }
    }
    if (fp && fp === data.meta.dbFingerprint) throw new Abort('esta es la MISMA base de la que salió el export (prod). No se escribe nada.');
  }

  // Metadatos de columnas: se inserta solo lo que existe en QA.
  const META = {};
  for (const r of await sel(
    `SELECT table_name AS t, column_name AS c, is_nullable AS n, column_default AS d, extra AS x
       FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name IN (?)`,
    [TABLES],
  )) {
    (META[r.t] = META[r.t] || new Map()).set(r.c, r);
  }
  for (const t of ['product', 'variant', 'option', 'image', 'product_shipping']) if (!META[t]) throw new Abort(`la tabla ${t} no existe en esta base`);
  const activeCol = META.product.get('active');
  log(`product.active: default en QA = ${activeCol ? String(activeCol.d) : '(no existe)'} (el import de Shopify no lo escribe; el catálogo filtra active=1)`);

  const ignored = new Map();
  const missingReq = new Map();
  const stats = {};
  let fake = 0;
  async function insert(table, row) {
    const meta = META[table];
    if (!meta) throw new Error(`la tabla ${table} no existe en esta base`);
    const keys = Object.keys(row).filter((k) => row[k] !== undefined && meta.has(k));
    for (const k of Object.keys(row)) if (!meta.has(k)) (ignored.get(table) || ignored.set(table, new Set()).get(table)).add(k);
    for (const [col, info] of meta) {
      const x = String(info.x || '');
      if (info.n === 'NO' && info.d == null && !/auto_increment|GENERATED/i.test(x) && !keys.includes(col)) {
        (missingReq.get(table) || missingReq.set(table, new Set()).get(table)).add(col);
      }
    }
    stats[table] = (stats[table] || 0) + 1;
    if (DRY) return row.id != null ? row.id : `dry-${table}-${++fake}`;
    const sql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
    const [r] = await c.query(sql, keys.map((k) => row[k]));
    return row.id != null ? row.id : r.insertId;
  }

  // ── Preflight (solo lectura) ──
  const userRows = (await selOpt(
    `SELECT u.id, u.brand_name, u.is_business, u.country, u.deleted_at, cur.code AS settings_currency
       FROM \`user\` u LEFT JOIN \`user_settings\` us ON us.id = u.settings_id LEFT JOIN \`currency\` cur ON cur.id = us.currency_id
      WHERE u.id = ?`,
    [QA_USER_ID],
  )) || (await sel('SELECT u.id, u.deleted_at FROM `user` u WHERE u.id = ?', [QA_USER_ID]));
  const user = userRows[0];
  if (!user) throw new Abort(`no existe el user ${QA_USER_ID} en esta base`);
  if (user.deleted_at) throw new Abort(`el user ${QA_USER_ID} está borrado`);
  log(`user ${QA_USER_ID}: brand_name=${user.brand_name || '-'} is_business=${user.is_business} país=${user.country || '-'} moneda=${user.settings_currency || '-'}`);
  const planCurrencies = [...new Set(plans.map((p) => p.product.price_currency_code).filter(Boolean))];
  if (user.settings_currency && planCurrencies.some((cc) => cc !== user.settings_currency)) {
    log(`aviso: la moneda del user (${user.settings_currency}) no es la de los productos (${planCurrencies.join(',')}); products habría convertido el precio de las variantes`);
  }
  const shops = (await selOpt('SELECT id, url, currency FROM `shopify_connection` WHERE supplier_id = ? AND deleted_at IS NULL', [QA_USER_ID])) || [];
  log(`shopify_connection del user: ${shops.map((s) => `${s.id}:${s.url}`).join(' ') || 'ninguna'}`);
  if (shops.some((s) => String(s.url || '').includes('dignitycollect'))) {
    log('AVISO FUERTE: el user de QA está conectado a la tienda REAL de Careless. Una orden pagada en QA de un producto origin=SHOPIFY crea la orden en esa tienda (extensions handleOrderPaid).');
  }
  const rates = (await selOpt('SELECT currency, enabled FROM `exchange_rate` WHERE currency IN (?)', [[...new Set([...planCurrencies, 'NOK', 'EUR'])]])) || [];
  log(`exchange_rate: ${rates.map((r) => `${r.currency}:${r.enabled}`).join(' ') || 'sin filas (la conversión de moneda del catálogo fallará si piden otra moneda)'}`);

  // Channel.
  let channel = null;
  const loadChannel = async (id) => {
    const rows = (await selOpt(
      `SELECT cu.id, cu.user_id, cu.active, cu.deleted_at, cu.custom_name, cu.channel_id, cu.user_channel_api_key_id, cus.markets
         FROM \`channel_user\` cu LEFT JOIN \`channel_user_settings\` cus ON cus.id = cu.channel_user_settings_id WHERE cu.id = ?`,
      [id],
    )) || (await sel('SELECT cu.id, cu.user_id, cu.active, cu.deleted_at, cu.custom_name, cu.channel_id, cu.user_channel_api_key_id FROM `channel_user` cu WHERE cu.id = ?', [id]));
    return rows[0] || null;
  };
  if (env.QA_CHANNEL_ID) {
    const id = Number(env.QA_CHANNEL_ID);
    if (!Number.isInteger(id) || id <= 0) throw new Abort('QA_CHANNEL_ID tiene que ser un entero');
    channel = await loadChannel(id);
    if (!channel) throw new Abort(`no existe el channel_user ${id}`);
    if (channel.deleted_at) throw new Abort(`el channel_user ${id} está borrado`);
  } else {
    const cands = await sel(CHANNELS_SELLING_ACCOUNT_SQL, Array(6).fill(QA_USER_ID));
    if (cands.length === 1) {
      channel = await loadChannel(cands[0].channel_user_id);
      log(`channel autodetectado: ${channel.id} (dueño ${channel.user_id})`);
    } else {
      log(`aviso: sin QA_CHANNEL_ID y ${cands.length} channels candidatos (${cands.map((x) => `${x.channel_user_id}/dueño ${x.owner_id}`).join(', ') || 'ninguno'}): los productos se crean SIN channel y no se van a ver en ningún catálogo`);
    }
  }
  if (channel) {
    const [{ n: keyOk }] = channel.user_channel_api_key_id
      ? await sel('SELECT COUNT(*) AS n FROM `user_channel_api_key` WHERE id = ? AND deleted_at IS NULL', [channel.user_channel_api_key_id])
      : [{ n: 0 }];
    log(`channel ${channel.id}: "${channel.custom_name || '-'}" dueño=${channel.user_id} active=${channel.active} api_key=${Number(keyOk) ? 'sí' : 'NO'} markets=${channel.markets || '-'}`);
    if (channel.active != null && !Number(channel.active)) log('aviso: el channel está inactivo (campaigns lo descarta en channelForBrand)');
    if (!Number(keyOk)) log('aviso: el channel no tiene api key viva: nadie puede pedir su catálogo');
    const owners = (await sel(CHANNEL_PRODUCT_OWNERS_SQL, Array(5).fill(channel.id))).map((r) => Number(r.owner_id));
    const others = owners.filter((o) => o !== QA_USER_ID);
    log(`marcas que ya publica el channel: ${owners.join(',') || 'ninguna'}`);
    if (others.length && !truthy(env.ALLOW_MULTI_BRAND)) {
      throw new Abort(`el channel ${channel.id} ya tiene productos de otra(s) marca(s) (${others.join(',')}): "una marca por channel" (ADR-0027/0028). ALLOW_MULTI_BRAND=1 para forzar`);
    }
  }

  // Shipping del user en QA.
  let shipping;
  if (env.QA_SHIPPING_ID) {
    const [s] = await sel('SELECT id, user_id, name, deleted_at FROM `shipping` WHERE id = ?', [env.QA_SHIPPING_ID]);
    if (!s || s.deleted_at) throw new Abort('QA_SHIPPING_ID no existe o está borrado');
    if (Number(s.user_id) !== QA_USER_ID) log(`aviso: QA_SHIPPING_ID es del user ${s.user_id}, no de ${QA_USER_ID}`);
    shipping = { id: s.id, existing: true, name: s.name };
  } else {
    const own = await sel('SELECT id, name, `default` AS is_default FROM `shipping` WHERE user_id = ? AND deleted_at IS NULL ORDER BY `default` DESC, created_at ASC', [QA_USER_ID]);
    if (own.length) {
      shipping = { id: own[0].id, existing: true, name: own[0].name };
    } else {
      // Como products: si el user no tiene shipping se crea uno (shipping.service.ts:743-777).
      // Del export, el de prod que usaban estos productos; si no, el "Default Shipping".
      const srcId = plans.map((p) => p.sourceShippingId).find(Boolean);
      const tpl = source === 'export' && srcId ? (data.shippings || []).find((s) => String(s.id) === String(srcId)) : null;
      const cur = user.settings_currency || planCurrencies[0] || 'NOK';
      let row;
      let countries;
      if (tpl) {
        row = strip({ ...tpl }, ['id', 'created_at', 'updated_at', 'deleted_at', 'user_id', 'countries']);
        countries = (tpl.countries || []).map((sc) => strip({ ...sc }, ['id', 'created_at', 'updated_at', 'deleted_at', 'shipping_id']));
      } else {
        const list = (env.QA_SHIPPING_COUNTRIES || user.country || catalogCountry).split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
        row = { amount: '10.00', custom_price_enabled: 0, name: 'Default Shipping', description: 'Default Shipping Method', currency_code: cur, default: 1 };
        countries = list.map((country) => ({ amount: '10.00', country, currency_code: cur }));
      }
      shipping = { id: crypto.randomUUID(), existing: false, name: row.name, row, countries };
    }
  }
  const shippingCountries = shipping.existing
    ? (await sel('SELECT country FROM `shipping_country` WHERE shipping_id = ? AND deleted_at IS NULL', [shipping.id])).map((r) => r.country)
    : shipping.countries.map((x) => x.country);
  log(`shipping: ${shipping.id} "${shipping.name || '-'}" (${shipping.existing ? 'existente' : 'NUEVO'}) países=${shippingCountries.join(',') || 'ninguno'}`);
  if (!shippingCountries.includes(catalogCountry)) {
    log(`aviso: el shipping no cubre ${catalogCountry}: el catálogo (shippingCountryCode=${catalogCountry}) no va a devolver estos productos`);
  }

  // Mapeos auxiliares (por nombre: los ids de prod no sirven en QA).
  const cache = new Map();
  const lookup = async (kind, sql, params) => {
    const key = `${kind}|${JSON.stringify(params)}`;
    if (!cache.has(key)) {
      const rows = await selOpt(sql, params);
      cache.set(key, rows && rows[0] ? rows[0].id : null);
    }
    return cache.get(key);
  };

  // ── Escritura ──
  const results = [];
  if (!shipping.existing && !DRY) {
    await c.beginTransaction();
    try {
      await insert('shipping', { id: shipping.id, ...shipping.row, user_id: QA_USER_ID });
      for (const sc of shipping.countries) await insert('shipping_country', { id: crypto.randomUUID(), ...sc, shipping_id: shipping.id });
      await c.commit();
    } catch (err) {
      await c.rollback();
      throw err;
    }
  } else if (!shipping.existing) {
    await insert('shipping', { id: shipping.id, ...shipping.row, user_id: QA_USER_ID });
    for (const sc of shipping.countries) await insert('shipping_country', { id: 'dry', ...sc, shipping_id: shipping.id });
  }

  async function linkChannel(pid, productRow) {
    if (!channel) return 'sin channel';
    const done = [];
    const g = await sel('SELECT id FROM `channel_group` WHERE channel_user_id = ? AND product_id = ? AND deleted_at IS NULL', [channel.id, pid]);
    if (!g.length) { await insert('channel_group', { channel_user_id: channel.id, product_id: pid, variant_id: null, collection_id: null, collection_shared_id: null }); done.push('channel_group'); }
    const cup = await sel('SELECT id FROM `channel_user_products` WHERE channel_user_id = ? AND product_id = ? AND deleted_at IS NULL', [channel.id, pid]);
    if (!cup.length) {
      // Copia desnormalizada, como processAddProduct (product.channelUser.service.ts:387-470).
      await insert('channel_user_products', {
        channel_user_id: channel.id,
        product_id: pid,
        collection_id: null,
        title: productRow.title,
        description: cleanSpecial(productRow.description),
        public_price: productRow.public_price,
        price_amount: productRow.price_amount,
        price_currency_code: productRow.price_currency_code,
        price_base_amount: productRow.price_base_amount,
        price_compare_at: productRow.price_compare_at,
        referral_fee: productRow.referral_fee != null ? productRow.referral_fee : 10,
        tags: productRow.tags != null ? productRow.tags : '',
        sku: productRow.sku,
        barcode: productRow.barcode,
        quantity: productRow.quantity,
        options_enabled: productRow.options_enabled,
        digital: productRow.digital,
        origin: productRow.origin,
        brand: productRow.brand,
      });
      done.push('channel_user_products');
    }
    return done.length ? `channel ${channel.id}: +${done.join(' +')}` : `channel ${channel.id}: ya estaba`;
  }

  for (const plan of plans) {
    const res = { handle: plan.handle, title: plan.product.title, warnings: plan.warnings.slice() };
    results.push(res);
    const existing = await sel(
      'SELECT id, origin, status, active FROM `product` WHERE user_id = ? AND deleted_at IS NULL AND (origin_id = ? OR shopify_id = ?) ORDER BY id',
      [QA_USER_ID, plan.originId, plan.shopifyId || plan.originId],
    );
    if (existing.length) {
      res.status = 'skip';
      res.warnings = [];
      res.productId = existing[0].id;
      res.note = `ya existe (product ${existing.map((x) => x.id).join(',')})`;
      if (truthy(env.LINK_EXISTING) && channel) {
        if (!DRY) await c.beginTransaction();
        try {
          const [row] = await sel('SELECT * FROM `product` WHERE id = ?', [existing[0].id]);
          res.channel = await linkChannel(existing[0].id, row);
          if (!DRY) await c.commit();
        } catch (err) {
          if (!DRY) await c.rollback();
          res.status = 'error';
          res.error = String(err.code || '') + ' ' + redact(String(err.message || '').split('\n')[0]);
        }
      }
      continue;
    }
    if (!DRY) await c.beginTransaction();
    try {
      const productRow = { ...plan.product, user_id: QA_USER_ID };
      const pid = await insert('product', productRow);
      const vmap = new Map();
      for (const v of plan.variants) vmap.set(v.key, await insert('variant', { ...v.row, product_id: pid }));
      for (const o of plan.options) await insert('option', { ...o, product_id: pid });
      let nImg = 0;
      for (const im of plan.images) {
        const vid = im.variantKey != null ? vmap.get(im.variantKey) : null;
        if (im.variantKey != null && vid == null) { res.warnings.push('imagen de una variante que no se copió: se omite'); continue; }
        if (!im.productLevel && vid == null) continue;
        await insert('image', { ...im.row, product_id: im.productLevel ? pid : null, variant_id: vid != null ? vid : null });
        nImg++;
      }
      // imported_product: lo crea publish() con el dueño (product.service.ts:1657).
      const ips = plan.importedProducts.length ? plan.importedProducts : [{}];
      for (const ip of ips) await insert('imported_product', { ...ip, user_id: QA_USER_ID, product_id: pid, channel_user_id: null });
      // product_shipping -> shipping del user (shipping.service.ts:780-793).
      await insert('product_shipping', { id: DRY ? 'dry' : crypto.randomUUID(), product_id: pid, shipping_id: shipping.id, description: plan.shippingDescription });
      for (const cat of plan.categories) {
        const cid = await lookup('category', 'SELECT id FROM `category` WHERE name = ? AND slug <=> ? AND deleted_at IS NULL ORDER BY id LIMIT 1', [cat.name, cat.slug]);
        if (cid) await insert('product_category', { product_id: pid, category_id: cid });
        else res.warnings.push(`categoría "${cat.name}" (${cat.slug || '-'}) no existe en QA: se omite`);
      }
      for (const name of plan.subcategories) {
        const sid = await lookup('subcategory', 'SELECT id FROM `subcategory` WHERE name = ? ORDER BY id LIMIT 1', [name]);
        if (sid && META.product_subcategories_subcategory) await insert('product_subcategories_subcategory', { product_id: pid, subcategory_id: sid });
        else res.warnings.push(`subcategoría "${name}" no se copia`);
      }
      for (const name of plan.channels) {
        const chid = await lookup('channel', 'SELECT id FROM `channel` WHERE name = ? ORDER BY id LIMIT 1', [name]);
        if (chid && META.product_channels_channel) await insert('product_channels_channel', { product_id: pid, channel_id: chid });
        else res.warnings.push(`channel genérico "${name}" no se copia`);
      }
      res.channel = await linkChannel(pid, productRow);
      if (!DRY) await c.commit();
      res.status = DRY ? 'plan' : 'creado';
      res.productId = pid;
      res.detail = `v=${plan.variants.length} opt=${plan.options.length} img=${nImg} precio=${plan.product.price_amount} ${plan.product.price_currency_code} stock=${plan.variants.map((v) => v.row.quantity).join('/') || plan.product.quantity}`;
    } catch (err) {
      if (!DRY) await c.rollback().catch(() => {});
      res.status = 'error';
      res.error = String(err.code || '') + ' ' + redact(String(err.message || '').split('\n')[0]);
    }
  }

  // ── Resumen ──
  out(`\n=== ${DRY ? 'DRY_RUN: no se escribió nada' : 'IMPORT TERMINADO'} (user QA ${QA_USER_ID}, channel ${channel ? channel.id : '-'}, shipping ${shipping.id}) ===`);
  for (const r of results) {
    out(`${r.status.toUpperCase().padEnd(7)} ${r.handle} → product ${r.productId != null ? r.productId : '-'} | ${r.title}${r.detail ? ` | ${r.detail}` : ''}${r.note ? ` | ${r.note}` : ''}${r.channel ? ` | ${r.channel}` : ''}${r.error ? ` | ${r.error}` : ''}`);
    for (const w of r.warnings) out(`        aviso: ${w}`);
  }
  out(`filas ${DRY ? 'a insertar' : 'insertadas'}: ${Object.entries(stats).map(([t, n]) => `${t}=${n}`).join(' ') || 'ninguna'}`);
  for (const [t, cols] of ignored) out(`columnas que no existen en QA (ignoradas) en ${t}: ${[...cols].join(', ')}`);
  for (const [t, cols] of missingReq) out(`columnas NOT NULL sin default y sin valor en ${t}: ${[...cols].join(', ')} (el INSERT va a fallar)`);
  const created = results.filter((r) => r.status === 'creado').map((r) => r.productId);
  if (created.length) out(`ids nuevos: ${created.join(',')}`);
  if (!DRY && channel && created.length) {
    out(`caché: el dashboard puede tardar en verlos; se puede limpiar con POST {API}/channel/channel-user/${channel.id}/delete/cache desde dentro del clúster`);
  }
  if (results.some((r) => r.status === 'error')) process.exitCode = 1;
}

// ───────────────────────── arranque ─────────────────────────

const SECRETS = [];
function redact(text) {
  let s = String(text == null ? '' : text);
  for (const v of SECRETS) s = s.split(v).join('[redacted]');
  return s;
}
let CONN = null;

const argv = process.argv.slice(2);
if (argv[0] === '--bundle') {
  try { bundleMode(argv[1]); } catch (err) { log('ERR', err.message); process.exitCode = 1; }
} else if (argv[0] === '--preview') {
  try { previewMode(argv[1]); } catch (err) { log('ERR', err.message); process.exitCode = 1; }
} else {
  podMode(argv[0])
    .catch((err) => {
      if (err instanceof Abort) log(`ABORTADO: ${redact(err.message)}`);
      else log('ERR', err.code || '', err.errno || '', redact(String(err.message || '').split('\n')[0]));
      process.exitCode = err instanceof Abort ? 2 : 1;
    })
    .finally(async () => {
      if (CONN) await CONN.end().catch(() => {});
    });
}
