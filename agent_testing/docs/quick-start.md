# VibePlug/GoodVibes Quick Start Guide

## What is VibePlug/GoodVibes?

VibePlug/GoodVibes is a powerful plugin for Claude Code that enhances your development workflow with:

- **Precision Tools** - Advanced file operations, batch processing, and code analysis
- **Skills Library** - Curated knowledge for frameworks, libraries, and patterns (Next.js, React, tRPC, Prisma, etc.)
- **Specialized Agents** - Task-focused agents for engineering, reviewing, testing, and architecture
- **Smart Discovery** - Automatic project detection, pattern recognition, and codebase analysis

## Prerequisites

Before installing VibePlug/GoodVibes, ensure you have:

- **Claude Code CLI** - The official Claude Code command-line interface
- **Node.js 18+** - Required for running the plugin
- **Git** - For cloning the repository

Check your versions:

```bash
node --version  # Should be 18.0.0 or higher
git --version   # Any recent version
```

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/buzzkillb/vibeplug.git
cd vibeplug
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Plugin

```bash
npm run build
```

### 4. Install in Claude Code

```bash
claude plugin install
```

The plugin will automatically connect to Claude Code and become available in your sessions.

## First Use Examples

### Detect Your Project Stack

Use the analysis engine to automatically detect your project's technology stack:

```bash
mcp-cli call plugin_goodvibes_analysis-engine/detect_stack '{}'
```

This will identify your framework, language, build tools, databases, and more.

### Find Relevant Skills

Search the skills library for topics you're working with:

```bash
# Search for authentication skills
mcp-cli grep authentication

# Or search directly in the registry
mcp-cli call plugin_goodvibes_registry-engine/search_skills '{"query": "authentication"}'
```

### Load a Skill

Get detailed knowledge about a specific technology:

```bash
# Get Next.js best practices and patterns
mcp-cli call plugin_goodvibes_registry-engine/get_skill_content '{"skill_id": "nextjs"}'

# Get Prisma ORM guidance
mcp-cli call plugin_goodvibes_registry-engine/get_skill_content '{"skill_id": "prisma"}'
```

### Use the Engineer Agent

The engineer agent handles full-stack feature implementation:

```plaintext
In your Claude Code conversation:

"Use the engineer agent to implement a user authentication API endpoint with:
- Email/password validation
- JWT token generation
- Proper error handling
- TypeScript types"
```

The engineer will:
1. Analyze your existing patterns
2. Create the implementation
3. Validate with TypeScript and linting
4. Follow your project's conventions

## Quick Reference

### Key MCP Tools

| Tool | Purpose | Example |
|------|---------|---------|
| `detect_stack` | Identify project technologies | Detect framework, DB, tooling |
| `search_skills` | Find knowledge in skills library | Search for "nextjs", "prisma" |
| `get_skill_content` | Load full skill documentation | Get Next.js patterns |
| `scan_patterns` | Discover code patterns | Find API routes, components |
| `precision_read` | Read files efficiently | Extract outline, symbols |
| `precision_grep` | Search codebase | Find usage, patterns |
| `discover` | Parallel discovery queries | Batch search operations |
| `batch` | Execute batch operations | Multi-file edits, validation |

### Analysis Tools

```bash
# Stack detection
mcp-cli call plugin_goodvibes_analysis-engine/detect_stack '{}'

# Check package versions
mcp-cli call plugin_goodvibes_analysis-engine/check_versions '{}'

# Find code patterns
mcp-cli call plugin_goodvibes_analysis-engine/scan_patterns '{"pattern_type": "api-routes"}'

# Audit environment variables
mcp-cli call plugin_goodvibes_analysis-engine/env_audit '{}'
```

### Registry Tools

```bash
# Search skills
mcp-cli call plugin_goodvibes_registry-engine/search_skills '{"query": "react"}'

# Get skill content
mcp-cli call plugin_goodvibes_registry-engine/get_skill_content '{"skill_id": "nextjs"}'

# Get recommendations
mcp-cli call plugin_goodvibes_registry-engine/recommend_skills '{"context": "building api"}'

# Check dependencies
mcp-cli call plugin_goodvibes_registry-engine/skill_dependencies '{"skill_id": "trpc"}'
```

### Precision Tools

```bash
# Read file structure
mcp-cli call plugin_goodvibes_precision-engine/precision_read '{"files": ["src/app/page.tsx"], "extract": "outline"}'

# Search code
mcp-cli call plugin_goodvibes_precision-engine/precision_grep '{"queries": [{"pattern": "export function", "glob": "src/**/*.ts"}]}'

# Batch operations
mcp-cli call plugin_goodvibes_batch-engine/batch '{"id": "my-task", "operations": {...}}'
```

## Next Steps

- **Explore Skills** - Browse `plugins/goodvibes/skills/` to see available knowledge
- **Read Agent Docs** - Check `plugins/goodvibes/agents/` for specialized agents
- **Try Precision Tools** - Use precision_read, precision_grep for efficient operations
- **Run Batch Operations** - Execute multi-file changes atomically

## Getting Help

- **List all tools**: `mcp-cli tools`
- **Search tools**: `mcp-cli grep "keyword"`
- **Get tool schema**: `mcp-cli info <server>/<tool>`
- **View resources**: `mcp-cli resources`

For more detailed documentation, see the `/docs` directory in the repository.
