---
date: 2026-09-25
session: full-day
participants: [angelo, claude]
status: live
---

# Session — 2026-09-25 — Auditoría de la propiedad de cuentas, y la release a prod armada y detenida

## Goal

Angelo pidió llevar a producción todo lo que hay en `develop`, con Miguel corriendo las
migraciones. Al preparar el tren apareció que la mitad del arreglo de IDOR del 23 seguía sin
mergear, y terminó siendo una auditoría de toda la superficie de cuentas.

## Done

**El inventario de la release**. Producción congelada desde el **15 de septiembre** (salvo
`extensions`, que salió el 24, y la webapp el 22):

| Repo | Commits sin subir |
|---|---|
| shopcart | 51 |
| webapp | 29 |
| api | 23 |
| base-api | 20 |
| graphql | 14 |
| orders | 3 |
| collection, middleware, template, tracking, users, products, payment-processors | 2 c/u (bump del kernel) |

Es, en bloques: **tres PSPs que nunca corrieron en prod** (Nexi, Adyen, Kustom), el
endurecimiento de Stripe, el arreglo de IDOR a medias, el CronJob de reconciliación y las
pantallas nuevas del dashboard. CI en verde en `develop` en todos.

**Migraciones**: seis entre el kernel de prod (1.0.258) y el de develop (1.0.267) —
`productDescriptionUtf8mb41`, `titleProductUtf8mb4`, `titleVariantUtf8mb4`, `titlesUtf8mb4`,
`nexi-channel-toggle`, `adyen-channel-toggle`. Las cuatro de `utf8mb4` las fue aplicando Alan
a mano en septiembre por los feeds, así que probablemente ya estén; se confirma con
`SELECT name FROM migrations`. No hay que publicar nada del kernel: 1.0.267 está publicado
desde el 21.

**La precondición que puede romper cobros**: el código nuevo **rechaza** un webhook de Stripe
cuya firma no cuadre. Si no hay secreto no rechaza (verifica el objeto contra Stripe); si el
secreto es **incorrecto**, se rechazan todos y dejan de confirmarse los pagos. Alan encontró
exactamente eso en staging el 23 (*"estaba incorrecta por no uso"*) y dijo que arreglaría
prod sin dejar captura: hay que confirmarlo antes del deploy.

**La auditoría de la propiedad de cuentas.** Lo cerrado: `base-api#14` puso
`requireSelfOrAdmin()` en las siete rutas `/users/:id…` y `guardUserUpdate` con la lista de
campos que nunca se escriben; `api-microservice#24` cerró el borrado de conexiones. Lo
abierto, verificado leyendo el código que corre hoy:

1. **El registro escala a admin desde internet y sin autenticación.** `POST /api/users` no
   lleva `verifyToken` ni el guard de campos — es el signup —, el controlador reenvía
   `req.body` tal cual, y en users-ms `doSave()` hace
   `const { avatar, coverImage, email, password, isChannel, ...userDto } = userForm` y guarda
   `{ ...userDto }`: todo lo demás entra, relaciones incluidas. Un cuerpo con `userRole` nace
   admin; con `apiCredentials` elige su propia API key; con `business: {id}` escribe la fila
   de otra cuenta. Está reproducido en los tests de
   [users-ms#11](https://github.com/vio-live/vio-users-microservice/pull/11) contra la base en
   memoria. No se probó contra producción.
2. **El servicio sigue aceptando por dentro lo que el borde rechaza**: cualquier llamada que
   no pase por base-api entra igual.
3. **Inyección SQL en `find()`**: `andWhere(\`r.state=${requestState}\`)` desde el query
   string, más seis subconsultas interpoladas.
4. **Secretos en los logs**: `[userService.doSave] Saving form: …` corre antes del
   destructure, o sea la **contraseña del registro en claro**; en el update, el secreto del
   webhook de órdenes.
5. **La malla tiene dos rutas cargadas**: un `VirtualService` enruta `/users/`, `/orders/`,
   `/shopcart/` y el resto **directo a cada microservicio**, saltándose base-api. Hoy no se
   pueden usar — en prod el host `msrvc-p.vio.live` no resuelve y el TLS se corta por falta
   de certificado; en QA el gateway y el virtualservice apuntan a IPs distintas — y en
   ninguno de los dos clusters hay `AuthorizationPolicy` ni `RequestAuthentication`. Es un
   arma cargada: basta con que alguien le ponga DNS y certificado.

## Decisions

- **`J7E6j9dM` (tokens en los logs de `extensions`) queda aparcada**: hay clientes reales
  instalados y una ronda de pruebas en curso, y tocar el logging es ruido justo donde se está
  mirando. El análisis quedó completo en la tarjeta: `logging: true` de TypeORM (392 líneas
  con `shopify_connection` en la ventana medida), dos líneas que imprimen el token a mano, el
  volcado de `getEcomUser`, y tres sitios más de la misma familia.
- **Nada sale a prod hasta ordenar lo pendiente** (Angelo, 28/09).

## Blockers / open questions

Cuatro decisiones de Angelo, todas abiertas al cierre:

1. mergear `users-ms#11` para que el arreglo suba completo;
2. si la release va entera o se retiene `automatic_payment_methods` (toca iOS sin QA);
3. si se **borran o se protegen** las rutas `msrvc-*`;
4. hasta dónde rotar los secretos que ya pasaron por los logs.

Más la confirmación del `STRIPE_WEBHOOK_SECRET` de prod y las migraciones con Miguel.

## Next session

Abrir los catorce PRs `develop → prod` en orden (servicios de datos, shopcart y api, base-api,
graphql, webapp), con smoke test de una compra por Qliro y otra por Stripe al terminar.
