# goodvibes skills

Six skills, all loaded on demand and none always-on, so they cost nothing until one is invoked
by name.

Each lives at `skills/<name>/SKILL.md`, one directory deep. The layout is flat because the skill
loader discovers skills at exactly that depth; grouping them into further subdirectories makes
them invisible to it.

| Skill | What it covers |
|---|---|
| `intel-mastery` | Getting the most out of the 15 intel tools: the `base_path` and `resolved_path` contract, extract modes, batching, and when a native tool is the better choice. |
| `project-onboarding` | Mapping an unfamiliar codebase step by step with the intel analyzers, among them `code_surface`, `api_routes`, `db_schema`, `component_tree`, and `layout_analysis`. |
| `goodvibes-memory` | The four `.goodvibes/memory/` files, `decisions`, `patterns`, `failures`, and `preferences`, each a JSON array with a documented record shape. |
| `task-orchestration` | Splitting work across parallel subagents with native Task and Workflow tooling, following the Write-Review-Fix-Confirm pattern. No background daemon is involved. |
| `review-scoring` | The Write-Review-Fix-Confirm rubric, which produces a severity-ranked defect list with a confirmed or plausible verdict per finding rather than one overall score. |
| `service-integration` | Reaching authenticated APIs and project databases through the connect trust boundary: register the target, store credentials safely, then call `api_request` or `db_query`. |
