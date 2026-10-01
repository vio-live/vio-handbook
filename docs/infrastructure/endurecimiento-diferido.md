---
title: Registro de pendientes diferidos (retomar cuando haya recursos)
last-updated: 2026-10-01
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
| A3 | **Reservas de 1 año** (nodos de prod + MySQL prod) | **Ahorra 85-110 USD/mes** | Ninguno técnico: es compromiso de un año. Se posterga por no atar caja antes del live. Existe con pago mensual y sin desembolso inicial (Savings Plan). |

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
4. **`vio-infra-tf` en rojo** en la rama `chore/eliminar-hosts-reachu`, y ahora con **4** PRs de
   infra abiertos (#3 y #4 son de hoy).
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
