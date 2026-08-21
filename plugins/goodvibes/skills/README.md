# goodvibes skills

Flat `skills/<name>/SKILL.md` layout (plan §9.1: the v1 nested tier directories made these
invisible to the skill loader). Six skills, all on-demand, none always-on.

| Skill | What it covers |
|---|---|
| `intel-mastery` | precision-mastery successor: honest usage guide for the 15 intel tools, the base_path/resolved_path contract, when native tools are the better choice. |
| `project-onboarding` | Step-by-step codebase mapping using the intel analyzers (code_surface, api_routes, db_schema, component_tree, layout_analysis, ...). |
| `goodvibes-memory` | Documents `.goodvibes/memory/{decisions,patterns,failures,preferences}.json`: JSON arrays, not v1's markdown-with-custom-parser. |
| `task-orchestration` | Decomposing work with native Task/Workflow tooling and the Write-Review-Fix-Confirm (WRFC) pattern. No daemon. |
| `review-scoring` | The WRFC rubric: a defect list with severity + CONFIRMED/PLAUSIBLE verdicts, not a scalar score. |
| `service-integration` | Reaching authenticated APIs and project databases through the connect trust boundary: register, store credentials safely, then call api_request or db_query. |
