# Native Skill Loading Test Report

**Date**: 2026-02-16
**Test**: Native progressive disclosure vs custom skill injection
**Configuration**: Custom skill injection DISABLED (lines 113-121 in context-injection.ts)
**All other context injection**: ACTIVE (tool preferences, batch reminders, agent-specific guidance)

---

## Test Setup

4 agents spawned against `new-version-tests/test-app/` with NO skill hints in their prompts:

| Agent | Type | Task | Duration | Tools Used |
|-------|------|------|----------|------------|
| Engineer | goodvibes:engineer | Fix API security vulns | 162s | 26 |
| Reviewer | goodvibes:reviewer | Full code review | 138s | 7 |
| Security | goodvibes:reviewer | Security audit | 159s | 9 |
| Tester | goodvibes:tester | Write UserCard tests | 177s | 19 |

## Key Question

> With custom skill injection disabled, does Claude's native 3-level progressive disclosure system cause agents to discover and load skills?

## Results: Skill Discovery

### Did any agent use registry_engine tools to search/load skills?

| Tool | Engineer | Reviewer | Security | Tester |
|------|----------|----------|----------|--------|
| `search_skills` | No | No | No | No |
| `get_skill_content` | No | No | No | No |
| `recommend_skills` | No | No | No | No |
| Any registry_engine tool | No | No | No | No |

**Result: ZERO agents attempted to discover or load skills.**

### Did any agent reference skills in their reasoning?

- **Engineer**: 0 skill references
- **Reviewer**: 0 skill references  
- **Security**: 0 skill references
- **Tester**: 9 incidental SKILL.md references — all from reading `.goodvibes/memory/patterns.json` (which mentions skills in pattern descriptions) and broad grep results that happened to match skill files. **No intentional skill loading.**

### Did any agent discover or use validation scripts?

**No.** Zero references to any `scripts/validate-*.sh` file across all 4 transcripts.

## Results: Tool Usage

All agents successfully used precision_engine tools (the non-skill parts of context injection are still active):

| Tool | Engineer | Reviewer | Security | Tester |
|------|----------|----------|----------|--------|
| precision_read | 9 | 8 | 8 | 26 |
| precision_write | 9 | 4 | 4 | 10 |
| precision_grep | 19 | 8 | 5 | 9 |
| precision_edit | 3 | - | - | 11 |
| precision_exec | 17 | - | - | 3 |
| precision_glob | 3 | - | - | - |
| precision_config | - | 1 | 1 | 3 |
| precision_fetch | - | - | - | 3 |
| precision_symbols | - | - | - | 1 |
| discover | - | - | - | - |

## Results: .goodvibes/ Memory/Logs Access

| Resource | Engineer | Reviewer | Security | Tester |
|----------|----------|----------|----------|--------|
| .goodvibes/memory/ | 1 | 10 | 10 | 13 |
| .goodvibes/logs/ | 1 | 6 | 6 | 9 |

Agents did check memory/logs as instructed in their prompts.

## Results: Work Quality

| Agent | Output Quality | Notes |
|-------|---------------|-------|
| Engineer | Good | Fixed all SQL injections, added env vars, validation, types |
| Reviewer | Good | 3.2/10 score, 5 critical + 4 major issues identified |
| Security | Good | 14 findings with CVSS scores, proper remediation guidance |
| Tester | Good | 36 test cases in 437 lines, comprehensive coverage |

## Analysis

### Why native progressive disclosure failed:

1. **No frontmatter in system prompt** — Anthropic's Level 1 requires YAML frontmatter from skills to be in the system prompt. Our skills have frontmatter, but nothing loads it into the agent's system prompt when custom injection is disabled.

2. **No skill awareness** — Without Level 1 (frontmatter), agents have no knowledge that skills exist. They can't trigger Level 2 (load SKILL.md body) because they don't know there's anything to load.

3. **Registry engine tools are available but undiscoverable** — The tools `search_skills`, `get_skill_content`, `recommend_skills` exist as MCP tools, but agents have no reason to search for them without being told skills exist.

4. **Progressive disclosure requires a seed** — The 3-level system only works when Level 1 (frontmatter) is already present. Without that seed, the chain never starts.

### What this means:

Claude's native progressive disclosure is designed for:
- Skills installed in `~/.claude/skills/` where Claude Code's built-in loader reads frontmatter into system prompt
- The built-in loader handles Level 1 automatically

Our plugin's skills live in `plugins/goodvibes/skills/` which is NOT scanned by Claude's native loader. Therefore:
- **Native progressive disclosure does not work for plugin skills**
- **Custom injection is required** to bridge the gap

## Comparison with Previous Test (Custom Injection ON)

| Metric | Custom Injection ON | Native Only (OFF) |
|--------|--------------------|-----------------|
| Skills discovered | Yes (via injection) | No |
| Skills loaded | Partial (names only) | None |
| Scripts discovered | No | No |
| SKILL.md body loaded | No | No |
| Tool usage (precision_engine) | Yes | Yes |
| .goodvibes/ access | Yes | Yes |
| Work quality | Good | Good |

## Conclusions

1. **Custom skill injection is necessary** — Native progressive disclosure doesn't reach plugin skills
2. **Current injection is Level 1 only** — It provides skill names but agents don't load SKILL.md bodies (Level 2) or scripts (Level 3)
3. **The gap is at Levels 2 and 3** — Even WITH custom injection ON, agents weren't loading skill bodies or discovering scripts
4. **Work quality is unchanged** — Agents produce good results regardless of skill loading, suggesting skills may need to provide more unique value or be more tightly integrated

## Recommendations

1. **Re-enable custom injection** — It's the only mechanism that works for plugin skills
2. **Enhance injection to include Level 2** — Instead of just listing skill names, inject a brief description of what each skill teaches
3. **Add explicit script instructions** — For skills with validation scripts, the injection should tell agents: "After completing work, run `scripts/validate-*.sh` to verify"
4. **Consider skill frontmatter in system prompt** — Mimic Claude's native behavior by injecting frontmatter content (not just names) into agent context

---

*Report generated from 4-agent parallel test run. Total tokens: ~189K across all agents.*