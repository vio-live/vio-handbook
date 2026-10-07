# `printenv` dentro del pod no es la configuración del servicio

**Fecha:** 2026-10-07 · **Coste:** un diagnóstico equivocado, escrito en la tarjeta de un
compañero antes de comprobarlo bien.

## Qué pasó

Investigando por qué Vipps rechazaba todas las entregas en QA, comprobé las variables así:

```bash
kubectl exec <pod> -c shopcart -- sh -c 'echo $VIPPS_WEBHOOK_SECRET'   # vacío
```

Salió vacío, igual que `PAYMENT_SECRETS_KEY`, `VIPPS_CLIENT_ID`, `VIPPS_API_URL` y hasta
`API_BASE_HOST`. Conclusión: «en QA no hay ninguna variable de Vipps configurada».

Era falsa. El servicio estaba llamando a Vipps correctamente en ese mismo momento, y registrando
webhooks con una URL construida a partir de `API_BASE_HOST`. Si de verdad faltaran, nada de eso
funcionaría — y esa contradicción es la que debió frenarme.

## Por qué

Los microservicios de Vio **no leen el entorno del proceso**. El `.env` se descarga de un blob
durante el `docker build` (ver el `Dockerfile`: `az storage blob download … --name "${ENV_FILE}"`)
y la app lo parsea con dotenv al arrancar. `process.env` nunca recibe esas claves, así que
`printenv` no ve ninguna.

## Qué hacer en su lugar

Mirar el fichero, sin imprimir valores:

```bash
kubectl exec <pod> -c <svc> -- sh -c '
  ls -a | grep "^\.env"                       # qué ficheros hay
  for n in PAYMENT_SECRETS_KEY VIPPS_WEBHOOK_SECRET; do
    echo "$n: $(grep -c "^$n=" .env* 2>/dev/null | awk -F: "{s+=\$NF} END{print s+0}") linea(s)"
  done'
```

Cuenta líneas, no las enseña. Para un valor que no es secreto (una MSN, un host) se puede leer con
`grep -h "^CLAVE=" .env.local`.

Y para cambiarlo: **se edita el blob y se reconstruye la imagen**. `kubectl set env` no sirve, y
un `deployment` sin `env` ni `envFrom` —como estos— es exactamente lo que hay que esperar.

## La lección de fondo

Cuando una medición contradice algo que **está funcionando delante de ti** (el servicio llama al
PSP, el webhook tiene la URL buena), la medición es sospechosa antes que el sistema. Y lo que se
escribe en la tarjeta de otro se comprueba dos veces: corregir después cuesta más que verificar
antes.

Relacionado: [`verify-alan-claims-against-code`](./verify-alan-claims-against-code.md) — el mismo
principio, en la otra dirección.
