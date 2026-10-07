# `gh run list --branch` puede ocultar el run más reciente

**Síntoma.** Vas a re-ejecutar el último build de `develop`. Pides
`gh run list --repo X --branch develop` y el run más nuevo que ves es de hace una semana,
con un `headSha` que no es el HEAD de la rama. Conclusión aparente: "hay commits sin construir,
el CI no corrió". Si re-ejecutas ese run, además, reconstruyes un commit viejo (`rerun` construye
el commit **de ese run**, no el HEAD).

**Causa real.** El filtro `--branch` devolvió una lista incompleta. En `vio-api-microservice`
(07/10) con `--branch develop` el run más nuevo era `36692173429` (sha `c2de0525`, 30/09) y parecía
haber 5 commits sin CI. Sin el filtro, el primer resultado era `37520036911`, sha `4d262685`
— el HEAD exacto, del 06/10 a las 19:34. El run existía y había pasado.

**La pista que lo delató.** El `.env.local` dentro del pod en marcha tenía fecha del 06/10 19:36,
dos minutos después del último commit. Un artefacto más nuevo que el "último build" es imposible:
eso dice que el build existe y que la lista está mal, no que el pod esté raro.

**Cómo se evita.** Inventaria los runs **sin** `--branch` y filtra tú por `headBranch` y
`workflowName` en el `--json`. Y antes de cualquier `rerun`, compara el `headSha` del run con
el HEAD real de la rama (`gh api repos/O/R/git/ref/heads/<rama>`). Emparenta con
`feedback_rerun_reconstruye_el_commit_de_ese_run` y con `gh-search-prs-va-con-retraso`.
