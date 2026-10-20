#!/usr/bin/env python3
"""
¿Qué credenciales del .env.test antiguo de extensions son también las de prod?

Compara por SHA-256 los valores de las claves con pinta de credencial del `.env.test`
tal como estaba antes de vio-extensions #29 (commit 5158350) con los `.env` de los
Secrets `env-sc-*` del clúster de prod. **No imprime ningún valor**: solo nombres de clave
y en qué Secret coinciden. Lo que salga «COINCIDE CON PROD» hay que rotarlo.

Uso (desde un clon de vio-extensions-microservice, con kubectl al contexto de prod):
    python3 -I cmp-envtest-vs-prod.py /ruta/al/clon/de/vio-extensions-microservice
"""
import base64, hashlib, json, re, subprocess, sys

REV = '5158350'  # último develop con los valores antiguos
SECRETISH = re.compile(r'(KEY|SECRET|TOKEN|PASSWORD|PASS|PRIVATE|CLIENT_ID|SUBSCRIPTION|DSN|CREDENTIAL)', re.I)

def parse(text):
    out = {}
    for line in text.splitlines():
        m = re.match(r'^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$', line)
        if not m:
            continue
        v = m.group(2).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in '"\'':
            v = v[1:-1]
        elif not v.startswith('-----'):
            v = re.sub(r'\s+#.*$', '', v)
        out[m.group(1)] = v
    return out

def digest(v):
    return hashlib.sha256(v.replace('\\n', '\n').strip().encode()).hexdigest()

repo = sys.argv[1]
old = parse(subprocess.run(['git', '-C', repo, 'show', f'{REV}:.env.test'], capture_output=True, text=True, check=True).stdout)
secrets = json.loads(subprocess.run(['kubectl', '--context', 'vio-commerce-prod-sc', 'get', 'secrets', '-o', 'json'],
                                    capture_output=True, text=True, check=True).stdout)
index = {}
for s in secrets['items']:
    name = s['metadata']['name']
    if not name.startswith('env-sc-'):
        continue
    raw = base64.b64decode((s.get('data') or {}).get('.env', '')).decode('utf-8', 'replace')
    for k, v in parse(raw).items():
        if len(v) >= 8:
            index.setdefault(digest(v), set()).add(f'{name}:{k}')

for k, v in old.items():
    if not SECRETISH.search(k) or len(v) < 8:
        continue
    hits = sorted(index.get(digest(v), ()))
    print(f'{k}: ' + (f'COINCIDE CON PROD → {", ".join(hits)}' if hits else 'no está en prod'))
