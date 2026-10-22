## Aller (1329) en prod había quedado como brand: claim de Firebase + is_business — Miguel

- Quién: Miguel. Lo reportó Angelo: «el usuario de aller parece que quedó como brand no como
  publisher» (22/10 20:38 Oslo).
- Dónde: base de **producción** (`user.is_business`) y **Firebase `reachu-prod`** (custom claims del
  uid `Y2FVBHEEAHPR9PTLfGBklYXtdCq2`).
- Cuándo: 22/10/2026 ~20:45 Oslo.

### Diagnóstico

La fila de rol que puse a las 17:00 (`user_role` 708, Publisher) **estaba bien y seguía ahí**: el
micro `users` ya devolvía `accountType: publisher`. Comprobado llamando al endpoint real dentro del
pod: `GET /1329` → `accountType publisher`, features `commerce:read`, `channels:manage`,
`surfaces:manage`, `campaigns:manage`, `analytics:surfaces`.

Lo que estaba mal era **de dónde venía la cuenta**: se dio de alta por el flujo de **marca**, no de
publisher. Residuos:

- Firebase custom claims: `{"brand_name":"Aller media","business":true}` — **`business`, sin
  `channel`**.
- `user.is_business = 1`.

Con eso, `resolveAccountType` casaba **las dos** cosas (`matches: publisher, brand`) y el propio
servicio lo avisaba en el log: `user 1329 matches publisher, brand`. Ganaba `publisher` por el orden
de precedencia, pero cualquier consumidor que mire los claims (el micro de campañas los usa como
*fallback*, ADR aparte) o el flag `is_business` veía una marca.

### La referencia: cómo es el publisher que SÍ funciona en QA

`user` **1312** `allermedia` en QA: `is_business = 0`, claims
`{"brand_name":"Aller media","channel":true}`. Y el 1332, igual. El que está como marca en QA (1330)
tiene `business:true` e `is_business=1`. O sea, la forma buena es inequívoca.

### Hecho

Dejé 1329 con exactamente esa forma:

- `setCustomUserClaims` → `{"brand_name":"Aller media","channel":true}` (fuera `business`).
- `UPDATE user SET is_business = 0 WHERE id = 1329 AND is_business = 1` → 1 fila.
- La fila `user_role` 708 (Publisher, activa) **se queda**: en prod el micro `users` aplica la regla
  estricta (la base es la verdad) y sin ella no habría `channels:manage`. En QA los publishers viven
  del *fallback* de claims y no tienen fila — por eso QA no sirve de referencia para el rol.

### Verificado

- Claims releídos de Firebase: `{"brand_name":"Aller media","channel":true}`.
- `is_business` = 0.
- `GET /1329` sigue dando `accountType publisher` con las mismas 5 features.
- **Ya no sale el aviso de multi-match**: tras una llamada nueva, cero líneas
  `matches publisher, brand` en el log (antes había 5, todas anteriores al cambio).

### Lo que Angelo tiene que hacer

**Cerrar sesión y volver a entrar** con la cuenta de Aller. El rol de la base se lee en cada
petición, pero **el claim viaja dentro del ID token**: el token que tenga el navegador ahora sigue
diciendo `business: true` hasta que se renueve. Eso es lo único que falta para que lo vea.

### Sin residuos de marca que limpiar

1329 no tiene `brand_profile`, ni productos, ni collections, ni `shipping`. El alta por el flujo de
marca no dejó nada más.

---

## Angelo decide borrar la cuenta y crearla de nuevo ("no quiero que herede nada")

20:42 Oslo. Le dije que no hacía falta (ya estaba con la forma buena y verificada), lo reafirmó. Su
decisión. Lo que sí aporté es **la vía de herencia que el borrado NO corta**:

- `DELETE /users/me/:userId` hace lo correcto: soft-delete de la fila, **borra el usuario de
  Firebase** (así el email queda libre) y **cancela las suscripciones**.
- Pero **no borra el customer de Stripe**. Y `userService.manageCustomerStripe` busca el customer
  **por email** (`stripe.customers.list({ email, limit: 1 })`) y **lo reutiliza** si existe. Solo
  crea uno nuevo si la lista viene vacía.
- Conclusión: si se recrea la cuenta con el **mismo email** `aller@tipio.no`, la cuenta nueva
  **hereda el customer** `cus_VUM4CdnWJfQuZW` — en **modo live** — con su metadata apuntando al id
  viejo (1329) y su historial de suscripción cancelada.

Dos formas de que no herede nada, a elección de Angelo: borrar el customer en Stripe, o dar de alta
la cuenta nueva con otro email.

Detalle que sí comprobé para que el alta nueva no choque: el único índice único relevante de `user`
es sobre **`uid`**, no sobre `username`. `allermedia` se puede reusar.

Pendiente mío cuando exista la cuenta nueva: borrar la `user_role` 708 (queda huérfana) y poner la
fila Publisher en el id nuevo, y volver a verificar `accountType` contra el endpoint.
