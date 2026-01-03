# GoodVibes Tool Search Server

An MCP (Model Context Protocol) server providing 17 specialized tools for the GoodVibes Claude Code plugin.

## Overview

This server provides intelligent code assistance tools including:

- **Search Tools**: Search skills, agents, and tools in the GoodVibes registry
- **Context Tools**: Detect tech stack, scan project patterns, check npm versions
- **Documentation Tools**: Fetch library documentation and API references
- **Validation Tools**: Validate code implementations against best practices
- **Scaffolding Tools**: Create project structures from templates

## Installation

```bash
npm install
npm run build
```

## Usage

The server runs as an MCP server and is automatically configured by the GoodVibes plugin.

### Development

```bash
# Build the server
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Watch mode for development
npm run dev
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_skills` | Search for skills by keyword or category |
| `search_agents` | Search for specialized agents |
| `search_tools` | Search for available tools |
| `recommend_skills` | Get skill recommendations for a task |
| `get_skill_content` | Retrieve full skill documentation |
| `get_agent_content` | Retrieve full agent documentation |
| `skill_dependencies` | Get skill dependency graph |
| `detect_stack` | Detect project tech stack |
| `check_versions` | Check npm package versions |
| `scan_patterns` | Scan project for coding patterns |
| `fetch_docs` | Fetch library documentation |
| `get_schema` | Parse database schema files |
| `read_config` | Read project configuration files |
| `validate_implementation` | Validate code against best practices |
| `run_smoke_test` | Run quick validation checks |
| `check_types` | Run TypeScript type checking |
| `plugin_status` | Get plugin status and analytics |

## Architecture

```
src/
├── index.ts          # MCP server entry point
├── config.ts         # Configuration and constants
├── types.ts          # TypeScript interfaces
├── utils.ts          # Shared utilities
└── handlers/         # Tool handlers
    ├── search.ts     # Search handlers
    ├── content.ts    # Content retrieval handlers
    ├── context.ts    # Context detection handlers
    ├── docs.ts       # Documentation handlers
    ├── npm.ts        # NPM package handlers
    ├── schema.ts     # Schema parsing handlers
    ├── config.ts     # Configuration handlers
    ├── validation/   # Modular validation system
    │   ├── index.ts
    │   ├── types.ts
    │   ├── security-checks.ts
    │   ├── structure-checks.ts
    │   ├── error-handling-checks.ts
    │   ├── typescript-checks.ts
    │   ├── naming-checks.ts
    │   ├── best-practices-checks.ts
    │   └── skill-pattern-checks.ts
    ├── scaffolding.ts
    ├── smoke-test.ts
    └── status.ts
```

## Testing

The server has comprehensive test coverage (93.89%) with 428 tests.

```bash
# Run all tests
npm test

# Run with UI
npm run test:ui

# Generate coverage report
npm run test:coverage
```

## License

MIT
