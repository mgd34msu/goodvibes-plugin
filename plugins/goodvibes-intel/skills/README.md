# goodvibes-intel skills

Flat `skills/<name>/SKILL.md` layout (plan §9.1 — the v1 nested tier directories made these
invisible to the skill loader). Five skills, all on-demand — none always-on (R12: intel hosts
the shared content set since it's the flagship most users install).

| Skill | What it covers |
|---|---|
| `intel-mastery` | precision-mastery successor: honest usage guide for the 14 intel tools, the base_path/resolved_path contract, when native tools are the better choice. |
| `project-onboarding` | Step-by-step codebase mapping using the intel analyzers (code_surface, api_routes, db_schema, component_tree, layout_analysis, ...). |
| `goodvibes-memory` | Documents `.goodvibes/v2/memory/{decisions,patterns,failures,preferences}.json` — JSON arrays, not v1's markdown-with-custom-parser. |
| `task-orchestration` | Decomposing work with native Task/Workflow tooling + the Write-Review-Fix-Confirm (WRFC) pattern — no daemon. |
| `review-scoring` | The WRFC rubric: a defect list with severity + CONFIRMED/PLAUSIBLE verdicts, not a scalar score. |

`service-integration` (the 6th skill in the plan §11 count) ships with goodvibes-connect, not
here — lane 5 owns connect's content.
