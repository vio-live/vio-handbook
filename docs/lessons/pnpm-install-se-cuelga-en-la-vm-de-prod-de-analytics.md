# `pnpm install` se cuelga en la VM de prod del colector (954 MB de RAM)

**Síntoma.** Desplegando el colector en prod (`82.70.54.151`), `sudo pnpm install --prod=false` se queda
**10+ minutos al 1 % de CPU** sin terminar y sin error. El mismo comando en la VM de staging
(`129.151.196.99`) tarda segundos. El servicio sigue sirviendo la versión vieja, así que no se nota como caída.

**Causa real.** La VM de prod tiene **954 MB de RAM** y poco margen (≈95 MB libres, 491 MB en cache). El
install no está roto: está arrastrándose. Y casi siempre **no hace falta**.

**Cómo se arregla / se evita.** Antes de instalar, comprobar si el despliegue cambia dependencias:

```bash
git diff --stat <sha_viejo> <sha_nuevo> -- package.json pnpm-lock.yaml
```

Si sale **vacío**, saltarse el install y hacer solo `sudo pnpm build` con el `node_modules` que ya está
(143 MB, completo). El build tarda ~100 ms. Si el diff **no** está vacío, hay que instalar: entonces mejor
lanzarlo con paciencia o construir el bundle fuera y subir el `dist`.

**Comprobación de que el despliegue es el bueno:** `md5sum dist/index.js` en las dos VMs. Si coincide, lo que
corre en prod es byte a byte lo que se probó en staging. Ver también
`las-vms-de-analytics-no-tienen-clon-de-git`.
