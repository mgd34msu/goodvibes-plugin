## 2026-02-18: Precision Engine v2 — Absorb Batch Engine

**Context**: Batch engine reimplements everything independently (raw fs.readFile, child_process.exec) instead of delegating to precision engine. Zero production usage (batches_completed: 0). Discovery phase handler NOT implemented.

**Options Considered**:
1. **Fix batch delegation** — Make batch_engine call precision_engine internally
   - Pros: Keeps existing architecture
   - Cons: Maintaining two MCP servers, 65+ interface files, 5000+ lines
2. **Absorb into precision engine** — Move valuable concepts into precision engine, delete batch
   - Pros: One server, ~2000 lines replaces ~5000, composes with existing handlers
   - Cons: Larger change scope
3. **Build middleware** — Thin wrapper over precision engine
   - Pros: Minimal precision engine changes
   - Cons: Still two servers, still interface complexity

**Decision**: Option 2 — Absorb batch concepts into precision engine v2

**Rationale**: The concepts (file_ops, agent spawning, telemetry, hooks, runtime) are sound but belong IN the precision engine, not alongside it. One server eliminates all coordination overhead.

**New Features**: precision_exec file_ops, precision_agent, SQLite telemetry, unified hooks (4 events), PrecisionRuntime singleton, agent dossier format, project index v3 (token estimates)

**Removed**: Checkpoint system (git is sufficient), agent pool (orchestrator handles), mode system in tool (moved to config), fix loop (WRFC handles), 30+ hook events (4 unified events)

**Plan**: `precision-engine-v2-design.md`

---

## 2026-02-16: Project File Index Architecture

**Context**: Agents need fast access to project file listing without re-globbing on every discover call. Session-start hook and MCP server run in different processes.

**Decision**: Disk-shared JSON index at `.goodvibes/project-index.json`, built by session-start hook, maintained in-memory by precision-engine's `ProjectIndex` singleton, updated incrementally by precision_write/edit, exposed via discover `type: 'index'` queries.

**Key Choices**:
- Use `readdir` recursive (Node 20+) instead of adding fast-glob dependency to hooks
- Short JSON keys (`p`, `s`, `m`, `t`) for token efficiency
- Atomic writes (temp + rename) for cross-process safety
- Debounced flush (500ms) for batching rapid updates
- Lazy load in MCP server (graceful null if index doesn't exist)

**Plan**: `.goodvibes/plans/project-file-index-architecture.md`

---

## 2026-02-16: Skill Delivery Architecture — Agent .md as PRIMARY

**Context**: SubagentStart hook never fires for Task-spawned agents, so context-injection.ts never reaches subagents. 4-agent test confirmed 0% skill loading despite enhanced injection code.

**Options Considered**:
1. **Fix SubagentStart hook** — Requires Anthropic CLI changes, not under our control
2. **Inject skills via orchestrator prompt** — Adds ~145k tokens per agent, too expensive
3. **Agent .md as PRIMARY, hook as REINFORCEMENT** — Agent definitions loaded by Anthropic's native system, always available

**Decision**: Option 3 — Agent .md files are the primary skill delivery mechanism

**Rationale**: Anthropic's CLI loads agent .md definitions natively for every subagent. This is the ONLY reliable delivery path. Skills catalog + role assignments in agent .md files. Full precision-mastery + DPB content in SUBAGENT-PROTOCOL.md template (deployed to ~/.claude/ on session start). context-injection.ts serves as reinforcement when/if SubagentStart eventually works.

**Implications**: All skill catalog updates must be reflected in agent .md files, not just context-injection.ts. Template-based prompt deployment prevents hook from overwriting expanded content.

---

## 2026-02-15: Skill Overhaul — 4-Tier Architecture

**Context**: 173 existing technology-specific skills had zero usage across 4,186 sessions. Skills needed fundamental rethinking.

**Options Considered**:
1. **Keep existing skills, improve discovery**: Minor UI/search improvements
   - Pros: No content rewrite
   - Cons: Fundamental mismatch — skills describe technologies, not agent workflows
2. **Outcome-oriented skills with 4-tier architecture**: Replace all 173 with 25 skills across Protocol (5), Orchestration (2), Outcome (11), Quality (7)
   - Pros: Skills teach HOW to use GoodVibes tools, progressive disclosure, each skill has scripts/ and references/
   - Cons: Significant rewrite effort
3. **Hybrid approach**: Keep some existing, add new protocol layer
   - Pros: Less work
   - Cons: Still has unused skills cluttering registry

**Decision**: Option 2 — Full replacement with 4-tier outcome-oriented architecture

**Rationale**: Skills should teach agent behavior patterns (precision tool mastery, DPB loops, review scoring) rather than describe external technologies. Progressive disclosure (frontmatter -> SKILL.md -> references/) aligns with Anthropic spec.

**Implications**: Phase 1 (protocol) is foundation — all other skills depend on these 5 patterns being correct.

---

## 2026-02-11: Standalone Python Scripts vs HA Native Automations

**Context**: Needed to choose between HA YAML automations, AppDaemon, or standalone Python scripts for 4 AI automations that orchestrate multiple APIs.

**Options Considered**:
1. **HA YAML + Jinja2**: Native, but multi-API orchestration impractical in templates
2. **AppDaemon**: Python-based but adds a daemon dependency
3. **Standalone Python scripts**: Full Python, triggered via shell_command

**Decision**: Standalone Python scripts triggered by HA shell_command

**Rationale**: Multi-API orchestration (HA + Ollama + ntfy + Fitbit + Sonarr/Radarr/SABnzbd) requires full Python. Shell_command integration is simple and reliable.

**Implications**: Scripts run outside HA process, need nohup for long-running tasks (weekly reports with qwen3:14b).

---

## 2026-02-11: LLM Model Selection per Automation

**Context**: Two Ollama models available on RTX 5060 Ti 16GB - need to balance speed vs reasoning quality.

**Options Considered**:
1. **qwen2.5:14b everywhere**: Fast but less analytical
2. **qwen3:14b everywhere**: Better reasoning but slower
3. **Mixed**: Fast model for time-sensitive, reasoning model for weekly analysis

**Decision**: Mixed - qwen2.5:14b for morning briefing + anomaly narrator, qwen3:14b for weekly reports

**Rationale**: Morning briefing needs to arrive quickly after wake-up. Anomaly narration is real-time. Weekly reports can take 2-5 minutes since they're cron-scheduled.

**Implications**: Config exposes both `ollama_fast_model` and `ollama_reasoning_model` properties.

---
