# Comprehensive Guide: System Prompts and Context Injection in Claude Code & Subagents

Based on the official documentation, here is everything that controls what context, instructions, and system prompts agents and subagents receive.

---

## 1. CLAUDE.md Files: Locations, Precedence & Inheritance

### All Locations Where CLAUDE.md Files Are Loaded

Claude Code reads CLAUDE.md files from a hierarchical structure with automatic discovery:

| Location | Scope | Priority | Loaded When |
|----------|-------|----------|-------------|
| Managed policy paths | Managed policy (organization-wide) | Highest | Session start |
| CLI argument: --system-prompt / --append-system-prompt | Current session only | N/A | Session start |
| .claude/settings.local.json in project | Local project settings | High | Session start |
| CLAUDE.local.md in project root | Local project (gitignored) | High | Session start |
| ./CLAUDE.md or ./.claude/CLAUDE.md | Project root | Medium | Session start + nested discovery |
| .claude/rules/*.md | Modular project rules | Medium | Session start + path-specific loading |
| ~/.claude/CLAUDE.md | User home directory | Medium-Low | Session start (all projects) |
| ~/.claude/rules/*.md | User-level modular rules | Medium-Low | Session start (all projects) |
| Nested directories | Monorepo sub-packages | Dynamic | When Claude reads files in that subtree |

### Precedence Order (Higher Overrides Lower)

1. Managed policy (organization-level - cannot be overridden)
2. Local project (CLAUDE.local.md, .claude/settings.local.json)
3. Project (./CLAUDE.md, .claude/CLAUDE.md, .claude/rules/)
4. User (~/.claude/CLAUDE.md, ~/.claude/rules/)

### Automatic Discovery Behavior

- Recursive upward: Claude starts in the current working directory and recurses up to (but not including) the filesystem root
- Nested downward: Claude also discovers CLAUDE.md files nested in subtrees under the current working directory
- Rules subdirectories: All .md files in .claude/rules/ are automatically discovered and loaded recursively

### Inheritance by Subagents

CRITICAL: Subagents DO NOT automatically inherit CLAUDE.md files from the parent conversation.

Instead:
- Built-in subagents (Explore, Plan, general-purpose) receive only basic environment details
- Custom subagents receive only their frontmatter system prompt
- To give a subagent access to CLAUDE.md context, you must explicitly list skills in the subagent skills field

---

## 2. Agent Definitions for Task Tool (Subagents)

### Where Subagent Types Are Defined

| Location | Scope | Priority |
|----------|-------|----------|
| CLI flag: --agents | Current session only | Highest |
| .claude/agents/ | Current project | 2 |
| ~/.claude/agents/ | All projects (personal) | 3 |
| Plugin agents/ directory | Where plugin enabled | Lowest |

### What Each Agent Type Receives

| What Gets Passed | Details |
|------------------|---------|
| System prompt | Only the markdown body of the agent .md file (not parent system prompt) |
| Tools | Specified in tools field (or inherited from parent if omitted) |
| Model | Specified in model field (options: sonnet, opus, haiku, inherit) |
| Permissions | Specified in permissionMode field |
| Preloaded skills | Files listed in skills array (full content injected at startup) |
| CLAUDE.md | NOT inherited |
| Hooks | Only those defined in the agent own frontmatter |
| Environment | Working directory and basic session info |
| MCP tools | NOT available in background subagents; available in foreground |
| Previous context | Fresh context (no access to parent conversation history) |

---

## 3. Output Styles

### Do They Apply to Subagents?

NO. Output styles only affect the main conversation. When Claude delegates to a subagent:
- The subagent uses only its own system prompt (from frontmatter)
- Output style does NOT apply

---

## 4. Hook-Based Context Injection

| Hook Event | Can Inject Context | Mechanism |
|------------|-------------------|-----------|
| SessionStart | YES | JSON output with hookSpecificOutput.additionalContext |
| UserPromptSubmit | YES | Plain text stdout OR JSON with additionalContext |
| Setup | YES | JSON output with additionalContext |
| PreToolUse | YES | JSON with additionalContext to Claude before tool runs |
| PostToolUse | YES | JSON with additionalContext after tool completes |
| Other events | NO | Can block/allow but not inject context |

### Do Hooks Apply to Subagents?

Partially:
- Subagent-scoped hooks (defined in .claude/agents/name.md frontmatter): Only run while that subagent is active
- Project-level hooks (in settings.json): Do not run inside subagents
- Within-subagent hooks: A subagent can have its own PreToolUse, PostToolUse, Stop hooks

---

## 5. Subagent Context Inheritance: Complete Mapping

Subagent Startup Context:
- System Prompt: From agent frontmatter (markdown body) ONLY
- Tools: From tools field or inherited from parent
- Skills: From skills field (full content preloaded) - NOT inherited from parent
- Permissions: From permissionMode field, inherited as baseline
- Model: From model field or inherited
- Hooks: From agent frontmatter only - NOT inherited from project settings
- MCP tools: NOT available in background subagents

### Do Subagents See CLAUDE.md Files?

NO, NOT automatically. But you can:
1. Explicitly preload skills containing CLAUDE.md content
2. Include CLAUDE.md content directly in agent frontmatter
3. Use a skill with context: fork

### Do Subagents See MCP Tools?

- Background subagents: NO - MCP tools are not available
- Foreground subagents: YES - inherited unless explicitly denied

---

## 6. Summary: The Complete Context Control Hierarchy

For the main conversation:
1. Managed policy (org-level)
2. CLI flags (--system-prompt, --append-system-prompt)
3. Output styles
4. CLAUDE.md (local -> project -> user)
5. Skills
6. Hooks (SessionStart context injection)

For subagents:
1. Agent frontmatter (ONLY source of system prompt)
2. Preloaded skills
3. Agent-scoped hooks
4. Inherited tools/permissions/model

To enforce MCP tool preference:
- Explicit system prompt in agent definition
- Restrict competing native tools (disallowedTools)
- Hook-based blocking
- Skill-based knowledge injection
- Permission rules

KEY INSIGHT: Subagents do not inherit parent context by default - you must explicitly pass what they need through skills and frontmatter.
