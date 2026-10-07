---
title: Registro de pendientes diferidos (retomar cuando haya recursos)
last-updated: 2026-10-07
owner: miguel
---

# Qué es esto

Angelo decidió el 2026-09-30 posponer varias cosas **por una razón concreta y válida: hay que llegar
a producción con el dinero y el tiempo que hay**. No son olvidos ni deuda accidental; son decisiones
conscientes con fecha de revisión.

Este documento existe para que **ninguna se pierda**. Está ordenado por lo que cada una está
esperando, porque no todas esperan lo mismo.

> **Cuándo revisar esto:** cuando Vio esté live y haya margen. Repasar de arriba abajo y ejecutar lo
> que siga teniendo sentido. Varias habrán caducado solas.

---

## A. Esperan dinero

| # | Medida | Coste | Qué riesgo deja abierto |
|---|---|---|---|
| A1 | **HA zona-redundante en la MySQL de prod** | +178 USD/mes | Si cae la zona 3 de Sweden Central, la base se cae con ella. Los dumps diarios permiten reconstruir en otra región, no evitar el corte. |
| A2 | **Réplica de lectura de la MySQL de prod** | +~178 USD/mes | Sin capacidad de lectura separada ni failover manual rápido. |
| A3 | **Reservas de 1 año** (nodos de prod + MySQL prod) | **Ahorra ~154 USD/mes** sólo en los nodos | Ninguno técnico: es compromiso de un año. **Decisión de Angelo del 02/10: esperar a comprarla hasta que prod esté encendido y estable.** Ver el detalle debajo. |

### A3 en detalle: por qué se espera, y cuándo deja de convenir esperar

**La reserva factura 24/7 desde que se compra, esté la máquina encendida o apagada.** Con prod apagado
desde el 30/09, comprarla ahora sería pagar un año de algo que no está sirviendo. De ahí la decisión
del 02/10: **primero se enciende prod, después se reserva.**

Precios reales de `Standard_D4as_v5` en Sweden Central (consultados el 02/10 en
`prices.azure.com/api/retail/prices`, no estimados), para los **3 nodos** del pool de prod:

| Modalidad | USD/mes | Descuento |
|---|---|---|
| Pago por uso | 403 | — |
| Reserva 1 año | **249** | −38 % |
| Reserva 3 años | **159** | −60 % |

**Punto de equilibrio: 62 % del tiempo encendido** para la de 1 año (39 % para la de 3). Si prod va a
estar apagado más de un tercio del mes, la reserva **no** amortiza y conviene seguir con pago por uso.
Para un prod sirviendo tráfico de verdad, conviene claramente.

**Lo que la reserva NO cubre:** sólo alcanza al compute de los nodos. El Redis Enterprise (56/mes), el
load balancer (31), el ACR (23) y las IPs (12) se pagan igual — esos **133 USD/mes de prod apagado** no
bajan con ninguna reserva. El MySQL de prod tiene reserva aparte y conviene mirarla en el mismo
momento.

Sobre A3: es el único de la lista que **da** dinero en vez de costarlo. Conviene revisarlo en cuanto
la forma de la infraestructura deje de moverse — reservar un tamaño que después cambia es pagar por
lo que no se usa.

---

## B. Esperan una ventana o una decisión, no dinero

| # | Medida | Ahorro/efecto | Qué hace falta |
|---|---|---|---|
| B1 | **Promover `develop` -> `master` en `vio-base-api`** | lleva a prod el arreglo del resizer | Es un release, y **espera a que Alan confirme**. Producción ya está protegida por la regla de Cloudflare, así que no corre prisa. |
| B2 | ~~Mover QA y staging a Suecia~~ | — | **HECHO el 2026-10-01.** Staging corre en Sweden Central y Noruega quedó sin un solo recurso de Vio Commerce. |
| B3 | ~~`redus-vio-staging` -> Redis dentro del cluster~~ | — | **Sin objeto:** el recurso se **borró** el 01/10. El de Suecia (`redus-vio-staging-sc`) sigue siendo gestionado; si se quiere pasar a Redis en cluster, es una medida nueva, no esta. |
| B4 | **Cerrar más el horario del cluster QA** | ~17 USD/mes | **Corrección importante: los crons van en UTC.** `55 5`-`15 23` es **07:55-01:15 hora de Oslo**, no 06:00-23:00. O sea que staging está arriba de madrugada sin que nadie lo use: el margen es mayor de lo que se creía. Sigue dependiendo de si le molesta a Alan. |
| B5 | ~~Purgar `reachuqa2`~~ | — | **Sin objeto:** el registry se **borró** el 01/10 con los 122 GB. El de Suecia (`vioqasc`) nació con sólo los 13 `latest` en uso: **6,9 GB de 100**. |
| B6 | **`PAYMENT_SECRETS_KEY` en producción** | las credenciales de pago de los vendedores dejan de estar en texto plano en la DB de prod | **Espera el encendido de prod** (apagada desde el 05/10). En QA quedó activo el 07/10. No es solo poner la variable: hay un orden obligatorio de 4 pasos y después la clave ya no se puede quitar. Procedimiento completo en `docs/playbooks/prod-power-on-demand.md`. |
| B7 | **`VIPPS_PARTNER_WEBHOOK_SECRET`** | Vio se entera de capturas, devoluciones y cancelaciones de las unidades de venta del partnership | **Espera el encendido de prod** y que haya unidades firmadas por el partnership. En QA no bloquea nada. Vipps enseña el secreto **una sola vez**: registrar y guardar es una única pasada, y hay que guardar también el id del registro. Procedimiento en `docs/playbooks/prod-power-on-demand.md`. |

---

## C. No cuestan dinero: son trabajo pendiente

Estos no tienen excusa económica. Cuando haya un rato, se hacen.

1. ~~**Contraseñas en texto plano en `vio-infra-tf/variables.tf`**~~ — **HECHO el 01/10:**
   [`vio-infra-tf#4`](https://github.com/vio-live/vio-infra-tf/pull/4) quita el bloque `default` de
   `vio_commerce_db_passwords` y añade `example.tfvars` como plantilla. `.gitignore` ya excluía
   `*.tfvars` salvo el ejemplo, así que el patrón correcto ya existía y los `default` eran un atajo
   que se lo saltaba. **No se rota nada** (las credenciales ya no autenticaban) y **no hace falta
   reescribir el historial**: la de `qa` además quedó doblemente muerta porque ese servidor se borró
   el mismo día. Pendiente sólo la revisión de Alan.
2. ~~**MySQL de staging abierta a todo internet**~~ — **HECHO el 01/10.** Se borró la regla `all`
   conservando la de servicios de Azure, y horas después el servidor entero desapareció con la
   mudanza. Lo que desbloqueó el cierre fue la evidencia del lado que recibe:
   `performance_schema.hosts` mostraba que **el host que más se conectaba no era la aplicación**,
   sino `77.90.185.21` con **287 intentos** probando `root`/`admin`/`sa`.
3. **443 de la instancia Oracle de analytics** — **revisado el 01/10 y el riesgo es menor de lo que
   decía esta línea.** Comprobado desde fuera: el 443 sirve la app pública de eventos (necesita estar
   abierto), y **ClickHouse no es alcanzable**: 8123 y 9000 no responden, y las rutas típicas
   (`/?query=`, `/clickhouse/`, `/play`, `/ping`) devuelven el `index.html` de la SPA, no ClickHouse.
   **Limitación honesta:** se verificó el efecto, no la regla — no hay CLI de OCI en la máquina, así
   que la security list no se leyó. Si se quiere defensa en profundidad, queda confirmar que 8123 y
   9000 están cerrados también en la security list y no sólo en el firewall del host.
4. **`vio-infra-tf` en rojo — diagnosticado el 01/10, y eran dos cosas, no una.**
   El workflow fallaba desde el **24 de julio** en `terraform fmt -check -recursive` (exit code 3),
   por dos ficheros sin formatear: `aks.tf` y `modules/vio-commerce-db/main.tf`. Eso lo arregla
   [`#5`](https://github.com/vio-live/vio-infra-tf/pull/5), que es sólo `fmt`.
   **Pero el `fmt` estaba tapando el problema de verdad**, porque corre antes y cortaba el workflow.
   Con el formato arreglado el `plan` sí corre, y falla por su cuenta:
   - **El provider de Kubernetes no está configurado en CI**: apunta a `localhost`, así que cualquier
     recurso `kubernetes_*` revienta el `plan`. Es del workflow, no del código.
   - **El estado está muy desincronizado:** `Plan: 73 to add, 13 to change, 3 to destroy`, más varias
     IPs públicas que el estado cree que existen y ya no. Parte de la deriva es conocida: la infra se
     movió a Sweden Central **por CLI** (prod el 30/09, staging el 01/10) y el Terraform no se tocó.
   **Reconciliar el estado con Suecia es un trabajo aparte y grande**, no un rato. Lo que ya no
   procede es llamarlo "en rojo" sin más.
5. **`DISCORD_WEBHOOK`** sigue con fecha 2026-03-18, escalado desde julio.
6. **`vio_production` en ClickHouse sigue vacía.**

---

## D. En manos de otro

| Qué | Dónde | Estado |
|---|---|---|
| Tests del resizer | [`vio-base-api#25`](https://github.com/vio-live/vio-base-api/pull/25) | Abierto, revisión pedida a Alan. No lo mergeamos nosotros: ADR-0001. |
| `fix(ci)` del registry en helm | [`vio-base-api#22`](https://github.com/vio-live/vio-base-api/pull/22) | Abierto desde antes. |
| Desactivar el Gateway muerto de microservicios de QA | [`vio-infra-tf#3`](https://github.com/vio-live/vio-infra-tf/pull/3) | Abierto 01/10. La pregunta para Alan no es técnica: **¿staging necesita acceso por path a los microservicios?** |
| Quitar los `default` de las contraseñas | [`vio-infra-tf#4`](https://github.com/vio-live/vio-infra-tf/pull/4) | Abierto 01/10. |

---

## Lo que YA se hizo, para no repetirlo

- Retención de backup de la MySQL de prod subida de 7 a **35 días** (sin coste).
- **Backup diario fuera de región** a West Europe, verificado de punta a punta, menos de 1 USD/mes.
  Ver `backup-db-prod.md`.
- Geo-backup nativo: **no se puede**, Sweden Central no lo soporta. No volver a intentarlo.
- `container.vio.live` movido de Front Door a Cloudflare: **-36,9 USD/mes**. Ver
  `cdn-container-cloudflare.md`.
- La MySQL de staging entra en el horario del cluster QA: **-35 USD/mes**. Ver `qa-aks-scheduler.md`.
- El resizer, cerrado en el borde (regla de Cloudflare) y en el origen (`vio-base-api#24`, mergeado
  en `develop`).
