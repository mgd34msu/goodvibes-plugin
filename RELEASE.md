# Release Notes: v1.1.1

**Release Date:** 2026-02-04

## Summary

This patch release standardizes all 11 GoodVibes agents to enterprise-grade quality with consistent documentation structure, token-efficient output requirements, and comprehensive decision frameworks.

---

## Improvements

### Agent Standardization (All 11 Agents)

All agents now include consistent sections:

| Section | Purpose |
|---------|------|
| **Filesystem Boundaries** | Write-local, read-global enforcement |
| **Output Requirements** | Token-efficient reporting format with Must Include/Must NOT Include |
| **Capabilities** | Clear list of what the agent can do |
| **Will NOT Do** | Explicit boundaries to prevent scope creep |
| **Skills Library** | Related skills for each domain |
| **Decision Frameworks** | Tables for common architectural choices |
| **Precision Tools** | Mandatory precision_engine tool usage |
| **Workflows** | DBE Loop (Discover Batch Execute) |
| **GoodVibes Memory & Logging** | Memory query and logging integration |
| **Context Injection** | Variables received when spawned by batch engine |
| **Mandatory Behavior** | Critical requirements summary |

### Agents Updated

- `engineer.md` - Full-stack implementation specialist
- `tester.md` - Testing and coverage specialist
- `reviewer.md` - Code review specialist
- `integrator.md` - Integration specialist (state, forms, real-time, AI, CMS, payments, email, files)
- `deployer.md` - Deployment and DevOps specialist
- `planner.md` - Planning and orchestration specialist
- `architect.md` - Architecture and design specialist
- `agent-factory.md` - Meta-agent for creating new agents
- `skill-factory.md` - Skill and slash command creator
- `integrator-state.md` - State management specialist
- `integrator-services.md` - External services integration
- `integrator-ai.md` - AI/LLM integration specialist

### Output Styles Consistency

- Fixed `justvibes.md` output section to match YAML config (Show Diffs: No, Show Telemetry: No)
- Clarified checkpoint frequency rationale:
  - `vibecoding`: per_batch (frequent for immediate rollback with human present)
  - `justvibes`: per_phase (less frequent for post-hoc analysis of unattended execution)

### Memory Infrastructure

- Created `.goodvibes/` directory structure
- Added logging files: `activity.md`, `decisions.md`, `errors.md`
- Added memory files: `decisions.json`, `patterns.json`, `failures.json`, `preferences.json`, `index.json`

### Plugin Configuration

- Added `plugins/goodvibes/CLAUDE.md` with mandatory orchestrator behaviors

---

## Changes Since v1.1.0

### v1.1.1
- Standardized all 11 agents with consistent section structure
- Added Output Requirements section (token-efficient reporting)
- Added Skills Library section (related skills per domain)
- Added Decision Frameworks section (architectural choice tables)
- Added Context Injection section (batch engine variables)
- Removed Mode-Aware Behavior section (moved to output styles)
- Fixed justvibes.md output section consistency
- Created .goodvibes/ memory and logging infrastructure
- Added plugins/goodvibes/CLAUDE.md for orchestrator rules

---

## Upgrade Instructions

```bash
/goodvibes:plugin update
```

Then restart your Claude Code session.

---

## Breaking Changes

None. This is a backward-compatible patch release.
