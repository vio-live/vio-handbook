---
title: "ENV_FILE_PROD no contiene el .env: contiene el nombre del blob"
last-updated: 2026-09-24
owner: miguel
---

# `ENV_FILE_*` es el nombre del blob, no su contenido

Encontrado el 2026-09-24 agregando una variable al `.env` de producción de
`vio-extensions-microservice`.

## El síntoma

Hace falta agregar una variable al entorno de un microservicio de Commerce. El workflow
(`deploy.yml`) pasa `--build-arg ENV_FILE=${{ secrets.ENV_FILE_PROD }}`, así que el reflejo es
pensar que ese secreto de GitHub **es** el archivo, concluir que como los secretos de GitHub no
se pueden leer de vuelta hay que reconstruirlo copiándolo de dentro de un pod, y pedirle a un
humano que pegue el resultado en Settings → Secrets.

Todo eso es innecesario, y además da miedo: implica sacar 170 variables de producción a un
archivo temporal.

## Lo que pasa de verdad

`ENV_FILE_PROD` vale literalmente `.env`. Es el **nombre de un blob**. El Dockerfile hace login
con un service principal y lo baja de Azure Blob Storage:

```dockerfile
RUN az storage blob download \
    --account-name "${AZ_STORAGE}" \
    --container-name env-file-microservices \
    --name "${ENV_FILE}" \
    --file  "${ENV_FILE}" \
    --auth-mode login
```

Así que el entorno se edita **en Azure**, con las credenciales de infra, sin tocar GitHub y sin
que nadie tenga que pegar nada a mano:

```bash
az storage blob snapshot --account-name containerproduction2 \
  --container-name env-file-microservices --name .env --auth-mode key   # backup primero
az storage blob download ... --file /tmp/x.env
# editar
az storage blob upload ... --overwrite
```

El `--auth-mode login` del Dockerfile funciona porque el service principal tiene el rol de datos;
desde una cuenta de humano suele hacer falta `--auth-mode key`.

## Dos cosas que sorprenden al llegar ahí

**El blob `.env` raíz lo comparten 12 microservicios** de `vio-commerce-prod` (api, collections,
extensions, middleware, orders, payment-processors, products, shopcart, templates, tracking,
users). Sólo `base-api` y `graph-ql` tienen el suyo (`base-api/.env`, `graph-ql/.env`). Cualquier
secreto que agregues ahí queda horneado en las doce imágenes. Es el problema del ADR-0016.

**El blob puede estar adelantado respecto de lo que corre.** Comparando el blob contra el `.env`
de dentro del pod aparecieron dos diferencias: `APP_NAME` (esperada, el Dockerfile la reescribe
con `sed`) y `STRIPE_WEBHOOK_SECRET`, que alguien cambió en el blob y nunca se desplegó. O sea
que **el próximo deploy de cualquiera de esos doce servicios arrastra cambios que no son tuyos**.
Conviene mirar ese diff antes de empujar:

```bash
P=$(kubectl --context vio-commerce-prod get pods -n default --no-headers | awk '/^extensions-/{print $1; exit}')
kubectl --context vio-commerce-prod exec -n default $P -c extensions -- cat /usr/src/app/.env > /tmp/pod.env
diff <(sort /tmp/blob.env) <(sort /tmp/pod.env) | grep -oE '^[<>] [A-Z0-9_]+=' | sort -u
```

(El `grep -oE` es para ver **qué claves** difieren sin volcar los valores por pantalla.)
