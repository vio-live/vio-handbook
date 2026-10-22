---
date: 2026-10-22
session: "Correos apagados en producción (EMAIL_DELIVERY fuera de orders, users y api)"
participants: [angelo, miguel]
status: live
---

# Correos apagados en producción

## Goal

Angelo (22/10): «los mails siempre apagados», en todos los entornos, prod incluido. Prod llevaba
`EMAIL_DELIVERY=on` en `orders`, `users` y `api` desde el release del 16/10, así que estaba
entregando de verdad por Mailjet. Reemplaza el criterio del 06/10 («prod necesita `on`»).

## Done

- Quién: Miguel. Dónde: cluster `vio-commerce-prod-sc` (RG `rg-vio-commerce-prod-sc`, Sweden
  Central), namespace `default`, y cuenta de almacenamiento `containerproductionsc` /
  contenedor `env-file-microservices`. Cuándo: 22/10 10:48–10:56 UTC.
- **Comprobado primero cómo lo lee el kernel:** `package-service/src/email/mailjet/index.ts` hace
  `String(process.env.EMAIL_DELIVERY ?? 'off')`. Quitar la variable deja los correos en `off`; no
  hace falta ponerla a `off` explícitamente.
- **Secrets de k8s (que es lo que leen los pods).** Los tres servicios montan el Secret
  `env-sc-<servicio>` en `/usr/src/app/.env` con `subPath`, así que el `.env` horneado en la imagen
  queda tapado y el cambio **no** necesita rebuild, pero **sí** recrear el pod (`subPath` no se
  refresca en caliente). Borrada la línea `EMAIL_DELIVERY=on` y re-aplicados con
  `kubectl create secret generic … --from-file=.env=… --dry-run=client -o yaml | kubectl apply -f -`
  (los Secrets se gestionan con `kubectl apply`, no con Helm: no llevan labels de Helm, solo
  `last-applied-configuration`). Tamaños: api 14352→14334, orders 14626→14608, users 14288→14270
  bytes; el diff es exactamente esa línea y nada más.
- **Blobs por servicio**, para que un build futuro no la reintroduzca: `api/.env`, `orders/.env` y
  `users/.env` subidos sin la línea. Respaldos en el mismo contenedor:
  `<servicio>/.env.backup-pre-emaildelivery-20261022`.
- **Pods recreados** uno a uno con `rollout restart` (RollingUpdate 25/25, 2 réplicas): sin corte.
- **Verificado dentro de los pods nuevos:** `grep "^EMAIL_DELIVERY" /usr/src/app/.env` no encuentra
  nada en los tres. `api-ecom.vio.live/` responde 200 y los arranques salen sin errores.

## Pendiente

- Fase 3 de Vipps en prod (partner keys en `shopcart` y `api`, `VIPPS_API_URL=https://api.vipps.no`,
  y `VIPPS_PARTNER_WEBHOOK_SECRET` en shopcart tras registrar el webhook): **esperando a que Angelo
  pase las partner keys de producción.** Nombres confirmados en código:
  `VIPPS_PARTNER_CLIENT_ID`, `VIPPS_PARTNER_CLIENT_SECRET`, `VIPPS_PARTNER_SUBSCRIPTION_KEY` y
  `VIPPS_PARTNER_WEBHOOK_SECRET` (`config.keys.ts` de los dos micros). **Hoy no existen en los
  Secrets de prod**: hay que añadirlas, no editarlas (el handoff decía «vacías»; funcionalmente es
  lo mismo, pero el `grep` no las encuentra).
- Rol Admin en prod para la cuenta de equipo Vio de Alan (`user_role` 1 activo): esperando el email
  que Alan comente en la tarjeta `djzHxncE`.

## Ojo

- Al verificar justo después del `rollout restart`, un pod del ReplicaSet viejo de `api` seguía
  `Running` con la variable puesta: tenía `deletionTimestamp` y estaba terminando. No era un rollout
  a medias. Si se mide en ese instante, el resultado engaña: mirar `deletionTimestamp` y las
  réplicas del ReplicaSet antes de concluir.
