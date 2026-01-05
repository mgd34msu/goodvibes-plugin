# Changelog

All notable changes to the GoodVibes Plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- JSDoc documentation for automation modules (fix-loop.ts, git-operations.ts)
- Windows NUL device artifacts to gitignore
- PACKAGE_NOTES.md documenting esbuild version pinning rationale

### Changed
- Modularized post-tool-use.ts from 566 lines to 153 lines with focused modules
- Replaced console.* with debug() across context and state modules
- Updated brutal-reviewer with context-aware TODO detection

### Fixed
- Added execSync timeout (30s) to telemetry/agents.ts
- Added debug logging to memory parser catch blocks

## [0.5.0] - 2026-01-04

### Added
- **Complete GoodVibes Enhancement Implementation** (74 tasks across 10 feature areas)
- **Vibecoding Output Style** - Autonomous orchestration mode with rapid agent delegation
- **JustVibes Output Style** - Silent execution mode for maximum autonomy with file logging
- **Subagent Telemetry Hooks** - Analytics and tracing for all subagent activity
- **Smart Context Injection** - Stack detection and context injection on session start
- **Persistent Memory System** - Cross-session project memory in `.goodvibes/memory/`
- **PostToolUseFailure Smart Recovery** - 3-phase fix loop with documentation research
- **Agent Chaining** - Automatic continuation after agent completion
- **Auto-Checkpoint Commits** - Milestone-based automatic commits
- **Pre-Commit Quality Gates** - TypeScript, ESLint, Prettier, and test verification
- **Comprehensive Automation Framework** - State management, test/build automation, git workflow, dev server monitoring, crash recovery
- New context gatherers: isEmptyProject, detectStack, getGitContext, loadMemory, checkEnvironment, getRecentActivity, scanTodos, checkProjectHealth, analyzeFolderStructure
- 40+ new module files for enhanced functionality
- 164 new tests (total: 262 tests) covering state, automation, and context modules
- Comprehensive plugin documentation README

### Changed
- Enterprise-grade code standards enforced (no mocks, no placeholders)
- Context window management with 150k target, 175k max tokens
- Orchestrator delegation rules clarified for vibecoding mode
- User interaction flow enhanced with proactive feature suggestions

### Fixed
- TODO scanner false positive on its own source code (obfuscated example patterns)
- README ecosystem reference corrected
- stack-detector formatStackInfo null check for edge cases

## [0.4.0] - 2026-01-03

### Added
- **Workflow-planner agent** for complex task breakdown with structured planning output
- **project_issues MCP tool** for detailed file:line level issue reporting
- Filesystem Boundaries section added to all 8 webdev agents and factory
- Persistent memory system storing decisions, patterns, failures, and preferences
- SubagentStart and SubagentStop telemetry hooks for lifecycle tracking
- Smart Context Injection for SessionStart hook with parallel context gathering
- Extensive trigger patterns for all webdev agents (proactive activation)
- 32 comprehensive tests for memory system

### Changed
- Workflow-planner removes all timeline/time estimates (meaningless for AI coding)
- All registries rebuilt (11 agents, 156 skills, 18 tools)
- Agent frontmatter fixed with YAML block scalars for descriptions with colons

### Fixed
- TODO scanner now skips test files and directories (reduced false positives from 3 to 0)
- .goodvibes directory added to gitignore
- Subagent-telemetry issues from code review (debug logging, error handling)
- Persistent-memory module issues (error handling, gitignore append bug, tsconfig emit)

### Security
- Lazy directory creation with security-hardened .gitignore (200+ credential patterns)
- ensureSecurityGitignore now appends only missing patterns instead of duplicating

## [0.3.0] - 2026-01-03

### Added
- **brutal-reviewer agent** for critical code review with supporting skills
- **code-architect agent** for refactoring and architecture decisions
- Comprehensive test coverage with major refactoring of MCP server
- Extracted handlers from god class pattern for better modularity

### Changed
- Codebase quality improvements: security, DRY principles, modularity
- Validation modules enhanced with actual implementation logic

### Fixed
- Placeholder/incomplete code in validation modules:
  - naming-checks.ts: Added actual PascalCase validation logic
  - best-practices-checks.ts: Added multi-line comment tracking for console.log detection
  - security-checks.ts: Enhanced SQL injection detection with template literals
  - docs.ts: Replaced empty catch blocks with proper error handling

### Security
- Command injection vulnerability fixed in git-operations.ts (spawnSync with array args)
- Cross-platform compatibility fixed (replaced Unix grep with Node.js fs)
- Type safety improvements (unknown vs any, proper type guards)

## [0.2.0] - 2026-01-02

### Added
- **plugin_status MCP tool** for real health checks
- All 12 hook events for comprehensive coverage
- Catch-all hook matchers for all MCP tools
- MCP server bundled with esbuild for distribution

### Changed
- MCP server refactored: extracted types, config, schemas, and handlers
- Hooks updated to comply with official Claude Code plugin spec
- All dependencies updated to latest versions
- Agents field updated to list individual .md files

### Fixed
- ESM __dirname error in MCP server
- Missing plugin-status.yaml tool definition
- MCP tool matcher patterns for plugin namespace
- Redundant hooks field removed from plugin.json
- plugin-status to show all 12 hooks explicitly
- plugin-status to actually read hooks.json

## [0.1.0] - 2026-01-02

### Added
- **Initial release** of GoodVibes Plugin
- marketplace.json for plugin distribution
- Basic README documentation
- Core plugin structure and configuration

---

## Version History Summary

| Version | Date | Highlights |
|---------|------|------------|
| 0.5.0 | 2026-01-04 | Complete enhancement implementation (74 tasks), 10 feature areas |
| 0.4.0 | 2026-01-03 | Workflow-planner, persistent memory, telemetry hooks |
| 0.3.0 | 2026-01-03 | brutal-reviewer, code-architect, major refactoring |
| 0.2.0 | 2026-01-02 | MCP server refactoring, hook system compliance |
| 0.1.0 | 2026-01-02 | Initial release |

[Unreleased]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/mgd34msu/goodvibes-plugin/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/mgd34msu/goodvibes-plugin/releases/tag/v0.1.0
