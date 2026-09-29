#!/usr/bin/env python3
"""Genera sc-<svc>.env a partir de original-<svc>.env (extraido de la imagen).
Reemplaza SOLO el valor, preservando el estilo exacto de comillas y espaciado
de cada linea. Si una clave esperada falta, lo reporta; no la inventa."""
import re, sys, pathlib, os
# Los secretos NO van en el repo: se leen de variables de entorno.
# DB_PASS, CACHE_PASS, SC_STORAGE_KEY, SB_TEST_KEY

SVCS = ["api","base-api","collections","extensions","graph-ql","middleware","orders",
        "payment-processors","products","shopcart","templates","tracking","users"]

# clave -> valor nuevo
REPL = {
    "DB_HOST":          "vio-ecom-db-prod-sc.mysql.database.azure.com",
    "TYPEORM_HOST":     "vio-ecom-db-prod-sc.mysql.database.azure.com",
    "DB_PASSWORD":      os.environ["DB_PASS"],
    "TYPEORM_PASSWORD": os.environ["DB_PASS"],
    "CACHE_HOST":       "redus-vio-prod-sc.swedencentral.redis.azure.net",
    "CACHE_PASSWORD":   os.environ["CACHE_PASS"],
}
PREFIX = "sc-"
if "--with-storage" in sys.argv:
    SCKEY = os.environ["SC_STORAGE_KEY"]
    REPL["AZURE_STORAGE_URL"] = "https://containerproductionsc.blob.core.windows.net"
    REPL["AZURE_SERVICE_CONTAINER_CONNECTION_STRING"] = (
        "DefaultEndpointsProtocol=https;AccountName=containerproductionsc;"
        f"AccountKey={SCKEY};EndpointSuffix=core.windows.net")

if "--test-profile" in sys.argv:
    # Aisla el entorno de test de todo sistema externo de produccion.
    PREFIX = "test-"
    REPL["AZURE_SERVICE_BUS_ORDER_CONNECTION_STRING"] = (
        "Endpoint=sb://vio-migtest-sb-sc.servicebus.windows.net/;"
        "SharedAccessKeyName=RootManageSharedAccessKey;"
        "SharedAccessKey=" + os.environ["SB_TEST_KEY"] + "")
    REPL["AZURE_SERVICE_BUS_PRODUCT_CONNECTION_STRING"] = REPL["AZURE_SERVICE_BUS_ORDER_CONNECTION_STRING"]
    REPL["IS_PRODUCTION"] = "false"            # apaga los crons de base-api
    REPL["SHOPIFY_GCP_PUBSUB_SUPPLIER_SUBSCRIPTION_TOPIC"] = "vio-sync-sub-migtest"

# KEY <espacios> = <espacios> <valor>   (captura comillas si las hay)
LINE = re.compile(r'^(?P<pre>(?P<key>[A-Z0-9_]+)\s*=\s*)(?P<q>["\']?)(?P<val>.*?)(?P=q)(?P<post>\s*)$')

d = pathlib.Path.home() / "vio-migracion" / "envs"
rc = 0
for svc in SVCS:
    src = d / f"original-{svc}.env"
    if not src.exists():
        print(f"{svc:20} FALTA {src.name}"); rc = 1; continue
    lines = src.read_text().splitlines(keepends=True)
    seen, out = {}, []
    for ln in lines:
        m = LINE.match(ln.rstrip("\n"))
        if m and m.group("key") in REPL:
            k = m.group("key")
            if k in seen:                      # clave duplicada: la ultima gana en dotenv
                print(f"{svc:20} AVISO clave duplicada {k}")
            q = m.group("q")
            nl = "\n" if ln.endswith("\n") else ""
            out.append(f'{m.group("pre")}{q}{REPL[k]}{q}{m.group("post")}{nl}')
            seen[k] = m.group("val")
        else:
            out.append(ln)
    (d / f"{PREFIX}{svc}.env").write_text("".join(out))
    missing = [k for k in REPL if k not in seen]
    tag = "OK " if not missing else "-- "
    print(f"{svc:20} {tag}{len(seen)}/{len(REPL)} cambiadas"
          + (f"   sin: {','.join(missing)}" if missing else ""))
sys.exit(rc)
