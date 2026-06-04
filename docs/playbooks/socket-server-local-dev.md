# socket-server — Flow de trabajo local (para Alan)

Guía paso a paso para levantar el backend de Vio (socket-server) en local, trabajar con data real y compartir snapshots con el equipo.

---

## Prerequisitos (una sola vez)

### 1. Herramientas necesarias
```bash
brew install postgresql@16   # para psql y pg_dump
brew services start postgresql@16  # o solo necesitas los binarios, no el servicio
```

Verifica:
```bash
psql --version   # debe ser 16.x
pg_dump --version
```

### 2. Docker Desktop corriendo
El backend usa un contenedor PostgreSQL local. Asegúrate de que Docker Desktop esté activo.

### 3. Clonar el repo
```bash
git clone https://github.com/tipiodevelopment/socket-server.git
cd socket-server
yarn install
```

### 4. Configurar `.env`
```bash
cp .env.local.example .env
```

Edita `.env` con dos valores:

```env
DATABASE_URL=postgresql://pgadmin:localpass@localhost:5432/socket_server

AZURE_STORAGE_CONNECTION_STRING=<pídele a Angelo el connection string de saapivio>
```

Para obtener el connection string tú mismo (si tienes acceso a Azure):
```bash
az storage account show-connection-string --name saapivio --resource-group rg-vio-shared -o tsv
```

---

## Arrancar el entorno local

### 1. Levantar la base de datos
```bash
docker compose up -d
```
Esto levanta PostgreSQL 16 en `localhost:5432` con la base `socket_server`.

### 2. Cargar la data de Angelo (snapshot)
```bash
yarn db:snapshot:list          # ver snapshots disponibles
yarn db:snapshot:pull          # descarga y restaura el más reciente
# o un snapshot específico:
yarn db:snapshot:pull angelo-sepulveda-2026-06-03-1725.sql
```

El script descarga el `.sql` desde Azure Blob (`saapivio/db-snapshots`) y lo restaura en tu PostgreSQL local automáticamente.

### 3. Arrancar el servidor
```bash
yarn dev
```

El backend queda disponible en `http://localhost:5001` (o el puerto configurado en `.env`).

---

## Ciclo de trabajo diario

```
1. docker compose up -d        # DB local arriba
2. yarn db:snapshot:pull       # traer última data de Angelo (opcional)
3. yarn dev                    # servidor local
```

---

## Subir tu data al equipo

Cuando tengas data relevante que quieres compartir con Angelo (o restaurar en staging):

```bash
yarn db:snapshot:push
# → Genera: alan-nombre-2026-06-04-1530.sql
# → Sube a: saapivio/db-snapshots
```

Angelo (o Miguel) puede luego hacer `yarn db:snapshot:pull alan-nombre-2026-06-04-1530.sql` para tenerla.

---

## Restaurar tu data en staging (para demos)

Cuando quieres que `api-staging.vio.live` tenga tu data local:

1. **Sube tu snapshot:**
   ```bash
   yarn db:snapshot:push
   # anota el nombre del archivo generado
   ```

2. **Pídele a Miguel** que corra el restore en staging con ese nombre de archivo.
   - Él tiene acceso a Azure para ejecutar el Container App Job que hace el restore.

3. **Deploy a staging** (Miguel también lo puede hacer):
   ```bash
   gh workflow run deploy.yml -f environment=staging
   ```

Resultado: `https://api-staging.vio.live` con tu data, disponible 24/7.

---

## Comandos de referencia

| Comando | Qué hace |
|---|---|
| `docker compose up -d` | Levanta PostgreSQL local |
| `docker compose down` | Para PostgreSQL local |
| `yarn dev` | Arranca el servidor en modo desarrollo |
| `yarn db:snapshot:list` | Lista todos los snapshots en Azure |
| `yarn db:snapshot:pull` | Restaura el snapshot más reciente en local |
| `yarn db:snapshot:pull <nombre.sql>` | Restaura un snapshot específico |
| `yarn db:snapshot:push` | Sube tu DB local a Azure como snapshot |
| `yarn db:seed` | Carga datos de prueba mínimos (alternativa a snapshot) |
| `yarn db:push` | Aplica migraciones Drizzle a la DB local |

---

## Troubleshooting

**`psql: command not found`**
```bash
export PATH="/opt/homebrew/opt/postgresql@16/bin:$PATH"
# añade esta línea a tu ~/.zshrc para que sea permanente
```

**`connection refused` al arrancar**
```bash
docker compose ps   # verificar que el contenedor postgres esté running
docker compose up -d  # si no está, levantarlo
```

**`AZURE_STORAGE_CONNECTION_STRING not set`**
Falta el valor en `.env`. Pídele a Angelo el connection string de `saapivio`.

**El snapshot descarga pero no restaura (`psql` error)**
Verifica que `DATABASE_URL` en `.env` apunte a `localhost:5432` y que Docker esté corriendo.
