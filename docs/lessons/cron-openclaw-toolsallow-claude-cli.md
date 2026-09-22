# Los crons de OpenClaw con `toolsAllow` nunca corren con Claude

- **Síntoma:** un cron isolated con `toolsAllow` y el modelo `anthropic/claude-*` falla con `CLI backend claude-cli cannot enforce runtime toolsAllow`. Si hay fallbacks, figura como "ok", pero lo ejecutó otro modelo (gpt-4o, gemini). Hay que mirar el campo `model` de `openclaw cron runs`.
- **Causa real:** en `openclaw.json`, los modelos `anthropic/*` tienen `agentRuntime: claude-cli`, y ese runtime no puede aplicar la restricción de herramientas. Si además el fallback apunta a un modelo que no está registrado en `models.providers`, fallan los dos y el cron no hace nada.
- **Otro modo de falla:** el gateway corre en el Mac de Angelo. Si el Mac duerme, no corre ningún cron (pasó del 18/09 12:52 al 21/09 11:38).
- **Cómo evitarlo:** las tareas de infra críticas (encender o apagar recursos) no van en crons de OpenClaw. Van en Azure, como Container Apps Jobs con managed identity y un script fijo (ver `docs/infrastructure/qa-aks-scheduler.md`). Si se usa un cron de OpenClaw, verificar en `cron runs` qué modelo lo ejecutó de verdad.
