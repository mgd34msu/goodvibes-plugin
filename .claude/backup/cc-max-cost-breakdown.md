# Claude Code Cost Breakdown Report

**Period:** January 15, 2026 10:00 AM Central → January 19, 2026 (Now)
**Timezone:** US Central (CST = UTC-6)
**Start Time (UTC):** 2026-01-15T16:00:00Z
**Scope:** ALL projects in ~/.claude/projects/

---

## Executive Summary

| Metric | Value |
|--------|-------|
| **Total Cost** | **$2,562.26** |
| **Total Requests** | 28,593 |
| **Total Tokens** | ~2.2B |
| **Projects Worked On** | 6 |
| **Primary Model** | Claude Opus 4.5 (99.8% of spend) |
| **Secondary Model** | Claude Haiku 4.5 (0.2% of spend) |

---

## Project Breakdown

| Project | Calls | Cost | % of Total |
|---------|------:|-----:|-----------:|
| **clausitron** | 16,199 | $1,480.31 | 57.8% |
| **vibeplug** | 12,290 | $1,075.19 | 42.0% |
| CITM | 75 | $4.70 | 0.2% |
| cccli | 19 | $1.24 | <0.1% |
| landingpage-goodvibes | 6 | $0.68 | <0.1% |
| input-test | 4 | $0.15 | <0.1% |
| **TOTAL** | **28,593** | **$2,562.26** | 100% |

---

## Token Usage by Model

### Claude Opus 4.5 (`claude-opus-4-5-20251101`)

| Token Type | Count | Rate | Cost |
|------------|------:|------|-----:|
| Input | 3,755,798 | $5.00/MTok | $18.78 |
| Output | 8,797,059 | $25.00/MTok | $219.93 |
| Cache Write (5-min) | 213,072,399 | $6.25/MTok | $1,331.70 |
| Cache Write (1-hour) | 0 | $10.00/MTok | $0.00 |
| Cache Read | 1,971,799,301 | $0.50/MTok | $985.90 |
| **Subtotal** | | | **$2,556.31** |
| **Requests** | 27,969 | | |

### Claude Haiku 4.5 (`claude-haiku-4-5-20251001`)

| Token Type | Count | Rate | Cost |
|------------|------:|------|-----:|
| Input | 141,270 | $1.00/MTok | $0.14 |
| Output | 107,729 | $5.00/MTok | $0.54 |
| Cache Write (5-min) | 2,579,014 | $1.25/MTok | $3.22 |
| Cache Write (1-hour) | 0 | $2.00/MTok | $0.00 |
| Cache Read | 20,517,606 | $0.10/MTok | $2.05 |
| **Subtotal** | | | **$5.96** |
| **Requests** | 602 | | |

### Grand Total by Token Type

| Token Type | Total Tokens | Total Cost |
|------------|-------------:|-----------:|
| Input | 3,897,068 | $18.92 |
| Output | 8,904,788 | $220.47 |
| Cache Write (5-min) | 215,651,413 | $1,334.92 |
| Cache Write (1-hour) | 0 | $0.00 |
| Cache Read | 1,992,316,907 | $987.95 |
| **TOTAL** | **2,220,770,176** | **$2,562.26** |

---

## Cache Analysis

### Cache Write Breakdown

| Cache Type | Tokens | Cost | % of Cache Writes |
|------------|-------:|-----:|------------------:|
| 5-minute ephemeral | 215,651,413 | $1,334.92 | 100% |
| 1-hour extended | 0 | $0.00 | 0% |

### Cache Efficiency

- **Cache Read Tokens:** ~1.99B tokens
- **Cache Read Cost:** $987.95 (at $0.50/MTok)
- **If uncached (at $5/MTok):** ~$9,962
- **Savings from caching:** ~$8,974 (90% reduction)

---

## Tool Usage & Cost Breakdown

### All Tools by Cost

| Tool | Calls | Cost | % of Total |
|------|------:|-----:|-----------:|
| (text only) | 11,813 | $1,092.50 | 42.6% |
| Read | 5,726 | $412.94 | 16.1% |
| Edit | 3,257 | $286.46 | 11.2% |
| Bash | 3,425 | $277.93 | 10.8% |
| Grep | 1,211 | $98.50 | 3.8% |
| Task | 492 | $97.69 | 3.8% |
| TodoWrite | 896 | $82.67 | 3.2% |
| Write | 435 | $75.49 | 2.9% |
| Glob | 1,083 | $74.04 | 2.9% |
| **MCP Tools** | **756** | **$37.93** | **1.5%** |
| TaskOutput | 66 | $15.71 | 0.6% |
| WebFetch | 86 | $7.79 | 0.3% |
| WebSearch | 24 | $2.35 | 0.1% |
| KillShell | 5 | $0.27 | <0.1% |
| **TOTAL** | **29,275** | **$2,562.26** | 100% |

---

## MCP Tool Usage (GoodVibes Plugin)

### MCP Tools by Cost (All 37 Tools Used)

| Tool | Action | Calls | Cost |
|------|--------|------:|-----:|
| `detect_stack` | info | 130 | $7.39 |
| `scan_patterns` | info | 107 | $5.97 |
| `check_types` | call | 76 | $4.34 |
| `check_types` | info | 68 | $4.15 |
| `find_tests_for_file` | info | 64 | $2.60 |
| `get_diagnostics` | info | 41 | $1.94 |
| `project_issues` | info | 21 | $1.92 |
| `detect_stack` | call | 76 | $1.66 |
| `scan_patterns` | call | 39 | $1.65 |
| `get_diagnostics` | call | 32 | $1.39 |
| `find_tests_for_file` | call | 21 | $0.68 |
| `plugin_status` | info | 3 | $0.51 |
| `find_dead_code` | info | 8 | $0.44 |
| `find_circular_deps` | info | 4 | $0.42 |
| `find_references` | info | 6 | $0.42 |
| `project_issues` | call | 11 | $0.35 |
| `scan_for_secrets` | info | 3 | $0.34 |
| `<server>/<tool>` (placeholder) | call | 3 | $0.30 |
| `find_dead_code` | call | 7 | $0.19 |
| `analyze_dependencies` | info | 3 | $0.18 |
| `get_api_routes` | info | 6 | $0.17 |
| `get_test_coverage` | info | 3 | $0.16 |
| `get_test_coverage` | call | 3 | $0.14 |
| `suggest_test_cases` | info | 1 | $0.08 |
| `find_circular_deps` | call | 3 | $0.08 |
| `scan_for_secrets` | call | 2 | $0.07 |
| `recommend_skills` | info | 2 | $0.06 |
| `recommend_skills` | call | 2 | $0.06 |
| `get_env_config` | info | 1 | $0.05 |
| `search_tools` | call | 2 | $0.04 |
| `analyze_dependencies` | call | 1 | $0.04 |
| `identify_tech_debt` | call | 1 | $0.04 |
| `identify_tech_debt` | info | 1 | $0.03 |
| `plugin_status` | call | 2 | $0.03 |
| `get_document_symbols` | info | 1 | $0.02 |
| `search_tools` | info | 1 | $0.02 |
| `get_api_surface` | info | 1 | $0.01 |

### MCP Summary

| Metric | Value |
|--------|------:|
| Total MCP Calls | 756 |
| Total MCP Cost | $37.93 |
| % of Total Spend | 1.5% |
| Unique MCP Tools Used | 19 |
| Info calls (schema lookups) | ~470 |
| Call calls (actual invocations) | ~286 |

---

## Cost by Category

| Category | Cost | % of Total |
|----------|-----:|-----------:|
| Text responses (thinking/explaining) | $1,092.50 | 42.6% |
| Core tools (Read, Edit, Bash, Grep) | $1,075.83 | 42.0% |
| Workflow tools (Task, TodoWrite, Write, Glob) | $329.89 | 12.9% |
| MCP tools (goodvibes) | $37.93 | 1.5% |
| Web tools (Fetch, Search) | $10.14 | 0.4% |
| Misc (TaskOutput, KillShell) | $15.98 | 0.6% |
| **TOTAL** | **$2,562.26** | 100% |

---

## Pricing Reference

### Claude Opus 4.5

| Token Type | Price per MTok |
|------------|---------------:|
| Base Input | $5.00 |
| 5-min Cache Writes | $6.25 |
| 1-hour Cache Writes | $10.00 |
| Cache Hits & Refreshes | $0.50 |
| Output | $25.00 |

### Claude Haiku 4.5

| Token Type | Price per MTok |
|------------|---------------:|
| Base Input | $1.00 |
| 5-min Cache Writes | $1.25 |
| 1-hour Cache Writes | $2.00 |
| Cache Hits & Refreshes | $0.10 |
| Output | $5.00 |

---

## Key Insights

1. **Two projects dominated spend:** clausitron ($1,480, 58%) and vibeplug ($1,075, 42%)
2. **Output tokens are the biggest per-token cost driver** at $25/MTok for Opus
3. **5-min cache writes are the largest absolute cost** ($1,335) due to high volume
4. **Cache reads saved massively:** ~2B tokens at $0.50/MTok vs $5/MTok = ~$9,000 saved
5. **No 1-hour extended cache was used** - all cache writes were 5-minute ephemeral
6. **MCP tools account for only 1.5%** of total spend despite 756 calls
7. **Edit tool has highest output tokens** due to generating code replacements
8. **Haiku usage is negligible** (<$6 total, used for lightweight subagent tasks)

---

## Data Collection Method

Token usage data was extracted from Claude Code session files located at:
```
~/.claude/projects/*/*.jsonl
~/.claude/projects/*/*/subagents/*.jsonl
```

Projects scanned:
- clausitron
- vibeplug
- CITM
- cccli
- landingpage-goodvibes
- input-test

Each session file contains JSONL entries with:
- `type: "assistant"` messages containing `message.usage` with token counts
- `message.content` arrays containing `tool_use` blocks with tool names
- `message.model` identifying the model used
- `timestamp` in UTC for time-range filtering

MCP tool calls were identified by parsing Bash command inputs for `mcp-cli call` and `mcp-cli info` patterns.

---

*Report generated: January 19, 2026*
*Analysis script: scripts/cost-analysis.js*
