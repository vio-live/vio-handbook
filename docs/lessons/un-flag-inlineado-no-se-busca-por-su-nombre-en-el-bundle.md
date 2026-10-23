---
title: Un flag inlineado no se busca por su nombre en el bundle
date: 2026-10-23
owner: Miguel
---

# Un flag inlineado no se busca por su nombre en el bundle

## Sintoma

Enciendes una bandera en Vercel (`ACCOUNT_PAYMENTS`, `VIO_CAMPAIGNS_V2`…), redesplegas, bajas el
bundle de `dashboard.ecom.vio.live` y haces `grep ACCOUNT_PAYMENTS`. **Cero coincidencias.** Parece
que el redeploy no recogio la variable.

Lo es el doble: ni el nombre esta, ni los ficheros que bajaste son los que la contienen.

## Causa real

Dos cosas, las dos del build:

1. **El nombre desaparece.** `next.config.js` la declara en `env: {}`, asi que webpack sustituye
   `process.env.ACCOUNT_PAYMENTS` por el literal `"true"`. El codigo fuente es
   `process.env.ACCOUNT_PAYMENTS === 'true'`, que queda como `"true"==="true"` y **terser lo pliega
   a `!0`**. Del nombre no queda nada.
2. **El chunk no esta en el HTML.** El dashboard es un export estatico con catch-all
   (`pages/[[...slug]]`), asi que las vistas se cargan perezosas. El HTML de `/` y el de `/settings`
   listan los **mismos 19** chunks del shell; los de las vistas (51 en total) solo aparecen en el
   mapa del runtime de webpack.

## Como se comprueba

```bash
# 1. el mapa de chunks del runtime
curl -s https://dashboard.ecom.vio.live/ -o i.html
WP=$(grep -oE '/_next/static/chunks/webpack-[a-f0-9]+\.js' i.html | head -1)
curl -s "https://dashboard.ecom.vio.live$WP" -o wp.js
node -e 'const s=require("fs").readFileSync("wp.js","utf8");
const m=s.match(/\{[^{}]*?\d+:"[a-f0-9]{16,}"[^{}]*?\}/g)[0];
const re=/(\d+):"([a-f0-9]{16,})"/g;let x,o=[];
while((x=re.exec(m)))o.push(`/_next/static/chunks/${x[1]}.${x[2]}.js`);
require("fs").writeFileSync("list.txt",o.join("\n"))'

# 2. bajar todos y buscar el MODULO por una cadena suya que sobreviva al minificado
mkdir -p all && cd all && xargs -P12 -I{} sh -c 'curl -s "https://dashboard.ecom.vio.live{}" -o "$(basename {})"' < ../list.txt
grep -l stripePaymentLink *      # ACCOUNT_SWITCHES -> el modulo account-payments

# 3. leer el VALOR de la constante exportada, no su nombre
#    o.d(t,{...,EW:()=>n,...});var r=o(...),a=o(...);let n=!0   <- encendida
#                                                      let n=!1 <- apagada
```

Busca el modulo por una **cadena de datos** (una etiqueta, una clave de objeto, una URL), que el
minificador conserva. Los identificadores no sobreviven.

## Control negativo, que es lo que cierra la duda

Compara contra el deploy anterior **del mismo commit**. El 23/10 los dos builds eran `a8f74d7`:
el de 08:23 trae `let n=!1`, el de 10:01 `let n=!0`. Mismo codigo, distinto valor -> lo que cambio
fue la variable y no el build. Sin ese control, un `!0` solo dice «esta encendida hoy», no «la
encendio mi cambio».

## Relacionado

- [`env-de-vercel-del-entorno-staging-no-llega-a-production.md`](env-de-vercel-del-entorno-staging-no-llega-a-production.md)
- [`dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md`](dominio-de-vercel-en-entorno-custom-no-sigue-a-gitbranch.md)
- [`aritmetica-de-uptime-no-prueba-que-un-flag-no-este-cargado.md`](aritmetica-de-uptime-no-prueba-que-un-flag-no-este-cargado.md)
