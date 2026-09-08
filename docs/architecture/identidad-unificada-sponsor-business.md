---
title: "Unificar identidad: el business de Commerce y el sponsor de Vio"
last-updated: 2026-09-08
owner: angelo
status: draft
---

# Unificar identidad: business (Commerce) ↔ sponsor (Vio)

Angelo (2026-09-08): *"queremos mezclar vio-backend con vio-commerce; los
business de commerce ahora serán también los sponsors de vio-backend"*.
Este doc mapea los dos modelos como están hoy y propone por dónde empezar.

## Los dos modelos, hoy

### Vio Commerce (MySQL, schema compartido por 13 servicios)

```
User            uid (Firebase), email, isBusiness, isSupplier, isAdmin
 ├─ Business    businessName, country, address, postCode, city, ecommerceSystem
 ├─ ChannelUser su presencia en cada canal (Shopify / Woo / Vev / SDK)
 │   └─ ChannelUserProducts   catálogo publicado + referralFee (la comisión)
 └─ conexiones  ShopifyConnection, WooConnection, MagentoConnection…
```

El **vendedor** de commerce es el `User` con `isBusiness`; `Business` guarda
sus datos de empresa y `ChannelUser` su presencia por canal.

### Vio Backend (Postgres, por entorno)

```
users      firebaseUid, reachuUserId, role, sponsorId, email
 └─ sponsors  name, logoUrl, colores, paymentMethods,
              commerceApiKey, commerceChannelId   ← el link actual
      └─ campaigns → components → broadcasts
```

El **sponsor** es la marca que aparece en una campaña: identidad visual
(logo, colores) + credenciales para hablar con commerce.

## El link que existe hoy, y por qué no alcanza

`sponsors.commerceApiKey` y `sponsors.commerceChannelId` son **dos strings
que un humano copia y pega** al crear el sponsor. Consecuencias medidas:

- `commerceChannelId` es **opcional**, y **nadie más lo consume** (el web SDK
  lo declara en types y no lo usa). Puede estar vacío sin que nada falle…
  hasta que algo lo necesita.
- El puente del dashboard de commerce depende de él para traducir canal →
  sponsor. Si está vacío, el dashboard devuelve `200` con ceros: verde y sin
  datos.
- No hay integridad: nada garantiza que el id pegado exista en commerce, ni
  avisa si el canal se borra o cambia.

## Lo que ya está a favor (y no se está usando)

**Los dos productos comparten el mismo proveedor de identidad.**
[ADR-0007](../decisions/0007-firebase-auth-single-idp.md): el Firebase de
Commerce es el IdP único. Y `vio-backend.users` **ya tiene** dos columnas
para esto:

| Columna | Qué es |
|---|---|
| `firebase_uid` | el mismo uid que `User.uid` de commerce |
| `reachu_user_id` | el id del usuario de commerce (nombre heredado de Reachu) |

O sea: **la llave para unir los dos mundos ya existe en el schema**. Lo que
falta es que el *sponsor* la use, en vez de depender de strings pegados a
mano.

## Propuesta — tres pasos, de menor a mayor compromiso

### Paso 1 — Cambiar la llave del link (chico, desbloquea ya)

Agregar a `sponsors` una referencia al usuario de commerce
(`commerce_user_uid`, el uid de Firebase, o `commerce_user_id`), y que **esa**
sea la llave canónica:

- Es **estable**: no cambia si se recrea un canal.
- Es **verificable**: se puede validar contra commerce.
- No es secreta (a diferencia de la api key), así que puede viajar en un
  join sin exponer nada.
- El colector de analytics resuelve sponsor por ahí en vez de por
  `commerce_channel_id`, y el dashboard de commerce deja de depender de un
  campo opcional.

`commerceApiKey` se queda: es la credencial para *hablar* con commerce, otra
cosa que el identificador.

### Paso 2 — Alta unificada

Cuando un business de commerce se convierte en sponsor, que el sponsor se
**cree o se enlace solo** a partir del usuario de commerce (nombre, logo,
país salen de `User`/`Business`), en vez de tipearse de nuevo. Un formulario
menos, y una fuente de verdad para los datos de empresa.

### Paso 3 — Decidir quién es dueño de qué (el que hay que discutir)

Dos modelos posibles, y conviene elegir explícitamente:

| | **Espejo** (sponsor referencia al business) | **Fusión** (el business ES el sponsor) |
|---|---|---|
| Datos de empresa | viven en commerce; el backend los referencia | una sola entidad, un solo lugar |
| Identidad visual (logo, colores) | en el sponsor (es de campaña, no de empresa) | habría que decidir dónde |
| Independencia | cada producto sigue desplegando solo | acoplamiento fuerte entre dos backends |
| Costo | bajo, incremental | migración grande |

**Recomendación**: espejo. Los productos siguen siendo dos sistemas con
ciclos propios, y el uid compartido alcanza para que se vean como uno solo
de cara al usuario. La fusión solo se justifica si algún día viven en el
mismo backend.

## Qué destraba esto, concretamente

1. El dashboard de commerce deja de depender de un campo opcional tipeado
   a mano → los números aparecen.
2. Un usuario de commerce puede ver sus datos de Vio (y viceversa) sin que
   nadie copie ids.
3. La comisión (`referralFee` / `OrderItem.fee`, que **sí existe** en
   commerce) se puede cruzar con la atribución de analytics por `order_id`,
   y ahí sale el reparto real de ingresos por campaña y componente.

## Antes de decidir, verificar

- ¿Cuántos sponsors tienen hoy `commerce_channel_id` cargado? (Si son
  pocos, el paso 1 es también la reparación de datos.)
- ¿Todos los sponsors corresponden a un usuario de commerce, o hay sponsors
  "solo marca" sin cuenta? Eso decide si la referencia es obligatoria u
  opcional.
- ¿`reachu_user_id` está poblado en los usuarios existentes?
