## Kernel 1.0.282 (brand policy urls) mergeado y desplegado en QA — Miguel

- Quién: Miguel, por pedido explícito de Angelo ("pues dale, que necesito terminar eso", 22/10 15:51 Oslo).
  **ADR-0001 levantado por Angelo para este merge**, igual que el 12/10. No es la norma.
- Dónde: `vio-live/package-database` (rama `develop`), los 7 repos del kernel, los 12 microservicios
  de Commerce y el clúster `kubernetesqa-sc` (QA, Sweden Central). **Producción sin tocar.**
- Cuándo: 22/10/2026, 15:54–16:35 Oslo.
- Contexto: la migración `BrandProfilePolicyUrls1792500000000` ya estaba corrida en QA (ver
  `2026-10-22-migracion-brand-policy-urls-qa.md`), así que el merge del kernel era el paso que
  faltaba para cerrar B7. Sin él las columnas existían pero ningún servicio las leía.

### Hecho

1. **PR #25 mergeada** a `develop` con merge commit (convención del repo), `b5916424`.
   Diff revisado antes: el `ALTER` de la migración es byte a byte el que apliqué a mano en QA, y
   la entidad declara `termsUrl`/`refundPolicyUrl` como `varchar(2048)` nullable utf8mb4.
2. **Run de push** `39791102984` — verde. Publicó **solo `database`** (más sus dependientes
   `testing`, `definitions`, `service`, que el bump arrastra) en **1.0.281**, y el freno de
   migraciones hizo lo que debe: `Nuevas migraciones desde v1.0.280` → **no disparó el bump** a los
   12 micros. `utils`, `config` y `logger` se quedaron en 1.0.280 → versiones mezcladas.
3. **`workflow_dispatch` con `pkg=all`** (run `39791959620`) — verde. `computeSyncedVersion` tomó el
   máximo (1.0.281) y publicó **los 7 en 1.0.282**. Esta vez el freno dio
   `Sin migraciones nuevas desde v1.0.281` (el tag se creó en el run anterior) y **disparó
   `kernel-published` a los 12 repos**.
4. **12/12 `kernel-bump` verdes**, los 12 con `@vio-/*` pineado a `1.0.282` en `develop`, y
   **12/12 `deploy.yml` verdes** → imágenes nuevas en QA.

### Verificado (no solo "el CI está verde")

- 12/12 pods `Running 2/2` en `kubernetesqa-sc` y **`@vio-/database` 1.0.282 dentro de cada
  contenedor** (`node -p require(...)/package.json`), no en el `package.json` del repo.
- La entidad compilada del contenedor mapea las columnas: `termsUrl` presente en
  `node_modules/@vio-/database/dist/entity/modules/surface/BrandProfile.js`.
- **Camino de lectura real ejercitado**, que es el riesgo de B7b:
  `GET /paymentmethod/vipps-partnership/accounts` dentro del pod de `api` → **200** con los datos de
  `brand_profile` (logo de Careless incluido). Es `brandLooksOf` → `getMany()` sin lista de campos,
  o sea el que pediría `terms_url`.
- Sonda TypeORM con la **misma `SnakeNamingStrategy`** que usa el kernel, dentro del pod de
  `campaigns`: el SQL emitido incluye `terms_url` y `refund_policy_url`, devuelve 4 filas y los
  enlaces de Careless (1338). Con una conexión sin naming strategy la sonda da un falso
  `Unknown column 'BrandProfile.createdAt'` — artefacto de la sonda, no del servicio.
- `Unknown column` / `ER_BAD_FIELD` = **0** en los 12 pods, con prueba de vida: el 200 de arriba.
- Los `orders-reconcile` / `shopcart-reconcile` en `Error` son `curl: (7) Failed to connect` durante
  la ventana de reemplazo de pods del despliegue (y los de la madrugada, del arranque de QA). Los
  posteriores están `Completed`. No tienen relación con el kernel.

### Pendiente

- **B7b sigue abierto para producción**: la migración se corre **antes** de que `api`, `campaigns` o
  `collection` arranquen con este kernel. Prod sigue en `master` y en 0/2 columnas.
- Dos versiones quemadas (1.0.281 database-only, 1.0.282 los 7). Es el coste conocido de que el
  freno de migraciones corte el primer run; no es un fallo.
