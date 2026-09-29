---
title: "OpenClaw: `maxHistoryShare` bajo con system prompt grande compacta cada turno y borra el historial"
date: 2026-09-29
owner: miguel
---

## Síntoma

La sesión de Discord de un agente OpenClaw "falla todo el rato": el agente pierde
memoria de la conversación en curso, responde que no hay historial previo y hay que
re-pegarle sus propios mensajes anteriores. No aparece ningún error en
`~/Library/Logs/openclaw/gateway.log` — ni excepciones, ni 4xx/5xx del proveedor
(las 503 de Gemini eran 10 sobre 681 llamadas, ruido).

Evidencia real (agente `miguel`, DM con Angelo, 2026-09-28):

- 20 compactions en una sola sesión de 13 horas, una inmediatamente antes de casi
  cada mensaje del usuario.
- Todas con `tokensBefore` entre 0 y 12.
- Todos los resúmenes son basura, porque al summarizer le llegó un bloque
  `<conversation>` vacío:
  - `"Please provide the content of the conversation between the tags <conversation></conversation>"`
  - `"## Goal - [Pending initialization: Please provide conversation content to define goals]"`

Ver en `~/.openclaw/agents/<agente>/sessions/*.jsonl` las entradas
`{"type":"compaction", ...}`. Empezó al menos el 23/09, peor el 27 y 28/09.

## Causa real

`agents.defaults.compaction.maxHistoryShare` estaba en **0.3** (el default de
OpenClaw es 0.5). Ese valor es la fracción de la ventana de contexto que se permite
para historial antes de que entre el safeguard pruning.

Con `agentRuntime: claude-cli` la ventana es 200k (`DEFAULT_CONTEXT_WINDOW = 2e5`
en `dist/cli-catalog-*.js`), así que el presupuesto de historial eran 60.000 tokens.
El system prompt del agente ya pesa ~60k (`cacheWrite: 59925` en cada mensaje
assistant del jsonl, y `totalTokens: 59925` en `sessions.json`):

```
59925 / 200000 = 0.2996  ->  justo en el umbral de 0.3
```

Es decir: el presupuesto se agotaba con el prompt solo, **antes del primer mensaje**.
El safeguard disparaba en cada turno. Y como el runtime `claude-cli` mantiene el
transcript dentro del proceso del CLI, la lista de mensajes que OpenClaw serializa
para el summarizer venía casi vacía (de ahí `tokensBefore=4`): se le pedía a
`google/gemini-3-flash-preview` resumir la nada, y el placeholder que devolvía
reemplazaba el historial.

## Cómo se arregla / evita

1. Subir `agents.defaults.compaction.maxHistoryShare` a 0.6–0.7. Nunca dejarlo por
   debajo de `system_prompt_tokens / context_window` con margen.
2. Medir el prompt antes de tocar el share: `totalTokens` en
   `~/.openclaw/agents/<agente>/sessions/sessions.json`, o `cacheWrite` de cualquier
   mensaje assistant del jsonl.
3. Adelgazar el system prompt si pasa de ~50k: `MEMORY.md` y `TOOLS.md` del workspace
   se inyectan enteros, y los bloques "Promoted From Short-Term Memory" crecen solos.
4. Activar `compaction.qualityGuard` para que un resumen basura se reintente en vez de
   commitearse encima del historial.

## Cómo detectarlo rápido

```bash
python3 - <<'PY'
import json,glob
for f in glob.glob('/Users/<user>/.openclaw/agents/<agente>/sessions/*.jsonl*'):
    for l in open(f):
        try: o=json.loads(l)
        except: continue
        if o.get('type')=='compaction':
            print(f.split('/')[-1][:8], o['timestamp'], 'tokensBefore=',o.get('tokensBefore'),
                  (o.get('summary') or '')[:60].replace('\n',' '))
PY
```

`tokensBefore` de dos dígitos, o un `summary` que pide la conversación, es este bug.
