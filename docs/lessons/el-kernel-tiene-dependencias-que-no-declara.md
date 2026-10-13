---
title: "El kernel requiere i18n-iso-countries y no la declara: el micro nuevo es el canario"
last-updated: 2026-10-13
---

# Síntoma

Un microservicio nuevo construye bien, la imagen sube, el pod arranca y se muere en bucle:

```
Error: Cannot find module 'i18n-iso-countries'
Require stack:
- node_modules/@vio-/service/dist/shipping/general/index.js
- node_modules/@vio-/service/dist/shipping/index.js
- node_modules/@vio-/service/dist/index.js
- dist/database/providers/database.service.js
```

El deploy falla en `helm --wait` con `Available: 0/1`, que parece un problema de probes o de
chart. No lo es: la app no llega a escuchar.

# Causa real

**`@vio-/service` requiere `i18n-iso-countries` en runtime y NO la declara** entre sus
dependencias (16 deps en 1.0.267, ninguna es esa). Los cinco micros existentes la llevan en
**su propio** `package.json` con `^5.1.0`, así que la resolución de Node la encuentra en el
`node_modules` del consumidor y nadie se enteró nunca.

Un micro nuevo con un `package.json` limpio es **el primer consumidor que no la aporta**, y por
eso es el canario de este tipo de deuda.

# Cómo saber si quedan más, sin descubrirlas de a una

Extraer el tarball del paquete y comparar **todos** sus `require()` externos contra lo que
declara:

```bash
cd $(mktemp -d) && npm pack @vio-/service@1.0.267 && tar xzf *.tgz
# requires externos del dist  vs  dependencies + peerDependencies
```

Resultado del 2026-10-13: de 16 requires externos, **`i18n-iso-countries` es la única no
declarada** en `@vio-/service@1.0.267`, y `@vio-/database@1.0.267` no tiene ninguna. Así que una
sola línea cierra el tema, y no hay tres reinicios más esperando.

**Ojo con el atajo de "copiar el package.json de otro micro":** los otros cinco comparten 8
dependencias que campaigns no tiene (`@nestjs/swagger`, `swagger-ui-express`, `@nestjs/axios`,
`@woocommerce/woocommerce-rest-api`, `axios-rate-limit`, `oauth-1.0a`, `crypto-js`,
`i18n-iso-countries`), pero el grep del kernel demuestra que **solo una** hace falta. Las demás
son deuda de cada app.

# Arreglo

- Inmediato en el consumidor: `"i18n-iso-countries": "^5.1.0"`
  ([campaigns#2](https://github.com/vio-live/vio-campaigns-microservice/pull/2)).
- De fondo: declararla en `@vio-/service`.
