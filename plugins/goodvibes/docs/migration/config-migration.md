# Configuration Migration Guide: v1 → v2

## Overview

GoodVibes v2 introduces new configuration files and restructures existing ones to support the batch-first architecture, mode system, and enhanced features. This guide shows how to migrate your v1 configuration to v2.

## Key Changes

### New Configuration Files

| File | Purpose | Required |
|------|---------|----------|
| `.goodvibes/config.json` | Main configuration file | Yes |
| `.goodvibes/hooks.json` | Lifecycle hook configuration | No |
| `.goodvibes/modes.json` | Custom mode definitions | No |
| `.goodvibes/templates.json` | Custom template definitions | No |

### Updated Plugin Files

| File | v1 | v2 | Changes |
|------|----|----|---------|
| Plugin manifest | `plugin.json` | `.claude-plugin/plugin.json` | New location, enhanced schema |
| MCP config | `mcp.json` | `.mcp.json` | Enhanced with batch-engine servers |
| LSP config | N/A | `.lsp.json` | New: TypeScript LSP integration |

### Removed Files

| File | Replacement |
|------|-------------|
| `.goodvibes/preferences.json` | Merged into `.goodvibes/config.json` |
| `.goodvibes/agent-config.json` | Merged into `.goodvibes/config.json` |
| Individual tool configs | Merged into `.mcp.json` |

## Configuration File Migration

### 1. Main Configuration (`.goodvibes/config.json`)

**v1 Structure (Multiple Files):**

`.goodvibes/preferences.json`:
```json
{
  "verbosity": "standard",
  "auto_save": true,
  "theme": "dark"
}
```

`.goodvibes/agent-config.json`:
```json
{
  "default_model": "claude-sonnet-4",
  "max_concurrent": 3,
  "default_budget": {
    "turns": 10,
    "tokens": 50000
  }
}
```

**v2 Structure (Unified):**

`.goodvibes/config.json`:
```json
{
  "version": "2.0.0",
  "project": {
    "name": "my-app",
    "root": ".",
    "stack": ["nextjs", "typescript", "tailwindcss"],
    "package_manager": "npm"
  },
  "mode": {
    "default": "vibecoding",
    "available": ["vibecoding", "justvibes"]
  },
  "agents": {
    "max_concurrent": 3,
    "default_model": "claude-sonnet-4",
    "default_budget": {
      "turns": 10,
      "tokens": 50000,
      "timeout_ms": 300000
    },
    "pool": {
      "max_concurrent": 6,
      "total_budget": {
        "tokens": 500000,
        "per_session": true
      }
    }
  },
  "batch": {
    "default_transaction_mode": "atomic",
    "default_execution_mode": "parallel",
    "max_workers": 8,
    "fail_fast": false,
    "auto_checkpoint": true,
    "auto_rollback": true
  },
  "validation": {
    "auto_typecheck": true,
    "auto_lint": true,
    "auto_test": false,
    "on_fail": "fix_loop"
  },
  "recovery": {
    "max_fix_attempts": 3,
    "checkpoint_frequency": "batch",
    "max_checkpoints": 10,
    "cleanup_after_hours": 24
  },
  "telemetry": {
    "enabled": true,
    "collect_metrics": true,
    "daily_aggregates": true,
    "retention_days": 30
  },
  "memory": {
    "enabled": true,
    "auto_record_decisions": true,
    "auto_record_patterns": true,
    "auto_record_failures": true,
    "max_entries": 1000
  },
  "output": {
    "default_mode": "minimal",
    "show_diffs": true,
    "show_telemetry": true,
    "max_tokens": 10000
  },
  "preferences": {
    "auto_save": true,
    "show_progress": true,
    "ask_on_ambiguity": true,
    "theme": "dark"
  }
}
```

**Migration Steps:**

1. Create new `.goodvibes/config.json`
2. Copy values from old `preferences.json` and `agent-config.json`
3. Add new required fields (project, batch, validation, recovery)
4. Set sensible defaults for new features
5. Delete old config files

**Migration Script:**

```bash
# Backup old configs
cp .goodvibes/preferences.json .goodvibes/preferences.json.bak
cp .goodvibes/agent-config.json .goodvibes/agent-config.json.bak

# Create new config (use template above)
cat > .goodvibes/config.json << 'EOF'
{
  "version": "2.0.0",
  ...
}
EOF
```

### 2. Hook Configuration (`.goodvibes/hooks.json`)

**v1: No Hook Configuration**

Hooks were hardcoded in agent behavior.

**v2: Explicit Hook Configuration**

`.goodvibes/hooks.json`:
```json
{
  "version": "2.0.0",
  "lifecycle": {
    "on_prepare": [
      {
        "name": "checkpoint",
        "enabled": true,
        "config": {
          "type": "automatic",
          "reason": "Pre-execution safety"
        }
      },
      {
        "name": "acquire_locks",
        "enabled": true,
        "config": {
          "timeout_ms": 30000,
          "fail_on_timeout": true
        }
      }
    ],
    "on_validate_after": [
      {
        "name": "typecheck",
        "enabled": true,
        "config": {
          "command": "npm run typecheck",
          "required": true
        }
      },
      {
        "name": "lint",
        "enabled": true,
        "config": {
          "command": "npm run lint",
          "required": false,
          "auto_fix": true
        }
      },
      {
        "name": "test",
        "enabled": false,
        "config": {
          "command": "npm run test",
          "required": false
        }
      }
    ],
    "on_commit": [
      {
        "name": "update_state",
        "enabled": true
      },
      {
        "name": "record_memory",
        "enabled": true
      },
      {
        "name": "emit_telemetry",
        "enabled": true
      }
    ],
    "on_rollback": [
      {
        "name": "rollback",
        "enabled": true,
        "config": {
          "restore_scope": {
            "files": true,
            "state": true,
            "git": false
          }
        }
      }
    ]
  },
  "custom": {
    "pre_commit": {
      "handler": ".goodvibes/hooks/pre-commit.ts",
      "async": true,
      "timeout_ms": 10000
    },
    "post_deploy": {
      "handler": ".goodvibes/hooks/post-deploy.ts",
      "async": true,
      "timeout_ms": 60000
    }
  }
}
```

**What to Configure:**

- **Enable/disable built-in hooks**: `typecheck`, `lint`, `test`, etc.
- **Configure hook behavior**: Commands, timeouts, requirements
- **Add custom hooks**: Project-specific automation

**Common Configurations:**

```json
// Strict validation
"on_validate_after": [
  { "name": "typecheck", "enabled": true, "config": { "required": true } },
  { "name": "lint", "enabled": true, "config": { "required": true } },
  { "name": "test", "enabled": true, "config": { "required": true } }
]

// Fast iteration
"on_validate_after": [
  { "name": "typecheck", "enabled": true, "config": { "required": true } },
  { "name": "lint", "enabled": false },
  { "name": "test", "enabled": false }
]

// Auto-fix everything
"on_validate_after": [
  { "name": "lint", "enabled": true, "config": { "auto_fix": true } },
  { "name": "format", "enabled": true, "config": { "auto_fix": true } }
]
```

### 3. Mode Configuration (`.goodvibes/modes.json`)

**v1: No Mode System**

All agents behaved the same way.

**v2: Built-in + Custom Modes**

`.goodvibes/modes.json`:
```json
{
  "version": "2.0.0",
  "modes": {
    "vibecoding": {
      "name": "vibecoding",
      "description": "Interactive, communicative development",
      "communication": {
        "show_progress": true,
        "explain_decisions": true,
        "ask_on_ambiguity": true,
        "report_results": "detailed"
      },
      "execution": {
        "auto_chain": false,
        "max_autonomous_batches": 1,
        "checkpoint_frequency": "batch",
        "parallel_agents": 3
      },
      "recovery": {
        "on_error": "ask",
        "on_ambiguity": "ask",
        "on_risk": "ask",
        "max_fix_attempts": 3
      },
      "output": {
        "default_mode": "standard",
        "show_diffs": true,
        "show_telemetry": true
      },
      "logging": {
        "log_decisions": true,
        "log_errors": true,
        "log_activity": true,
        "log_path": ".goodvibes/logs/vibecoding.md"
      }
    },
    "justvibes": {
      "name": "justvibes",
      "description": "Autonomous, silent execution",
      "communication": {
        "show_progress": false,
        "explain_decisions": false,
        "ask_on_ambiguity": false,
        "report_results": "summary"
      },
      "execution": {
        "auto_chain": true,
        "max_autonomous_batches": 10,
        "checkpoint_frequency": "operation",
        "parallel_agents": 6
      },
      "recovery": {
        "on_error": "fix_loop",
        "on_ambiguity": "best_guess",
        "on_risk": "checkpoint",
        "max_fix_attempts": 5
      },
      "output": {
        "default_mode": "minimal",
        "show_diffs": false,
        "show_telemetry": false
      },
      "logging": {
        "log_decisions": true,
        "log_errors": true,
        "log_activity": true,
        "log_path": ".goodvibes/logs/justvibes.md"
      }
    },
    "custom-strict": {
      "name": "custom-strict",
      "description": "Custom mode with strict validation",
      "extends": "vibecoding",
      "validation": {
        "auto_typecheck": true,
        "auto_lint": true,
        "auto_test": true,
        "on_fail": "rollback"
      }
    }
  }
}
```

**Custom Mode Example:**

```json
{
  "modes": {
    "production-deploy": {
      "name": "production-deploy",
      "description": "Safe production deployment",
      "extends": "vibecoding",
      "execution": {
        "auto_chain": false,
        "checkpoint_frequency": "operation"
      },
      "validation": {
        "auto_typecheck": true,
        "auto_lint": true,
        "auto_test": true,
        "on_fail": "rollback"
      },
      "recovery": {
        "on_error": "rollback",
        "on_risk": "ask"
      }
    }
  }
}
```

### 4. Plugin Manifest

**v1 Location:** `plugins/goodvibes/plugin.json`

**v2 Location:** `plugins/goodvibes/.claude-plugin/plugin.json`

**v1 Structure:**
```json
{
  "name": "goodvibes",
  "version": "1.0.0",
  "description": "GoodVibes plugin",
  "agents": ["engineer", "reviewer"],
  "tools": ["read", "write"],
  "skills": ["nextjs", "react"]
}
```

**v2 Structure:**
```json
{
  "name": "goodvibes",
  "version": "2.0.0",
  "displayName": "GoodVibes",
  "description": "Batch-first, parallel-native autonomous coding system",
  "author": "GoodVibes Team",
  "license": "MIT",
  "engines": {
    "claude-code": ">=1.0.0"
  },
  "categories": [
    "productivity",
    "development",
    "automation"
  ],
  "keywords": [
    "batch",
    "parallel",
    "autonomous",
    "full-stack"
  ],
  "agents": {
    "directory": "agents",
    "registry": "agents/_registry.yaml",
    "available": [
      "engineer",
      "reviewer",
      "tester",
      "architect",
      "deployer",
      "integrator"
    ]
  },
  "skills": {
    "directory": "skills",
    "registry": "skills/_registry.yaml",
    "categories": [
      "core",
      "stacks"
    ]
  },
  "tools": {
    "directory": "tools",
    "registry": "tools/_registry.yaml",
    "mcp_servers": [
      "precision-engine",
      "batch-engine",
      "registry-engine",
      "analysis-engine",
      "project-engine",
      "frontend-engine"
    ]
  },
  "hooks": {
    "directory": "hooks",
    "config": "hooks/hooks.json",
    "custom": "hooks/custom"
  },
  "templates": {
    "directory": "templates",
    "registry": "templates/_registry.yaml"
  },
  "output_styles": {
    "directory": "output-styles",
    "available": [
      "vibecoding",
      "justvibes"
    ]
  },
  "commands": {
    "directory": "commands"
  },
  "activation": {
    "on_startup": true,
    "on_command": [
      "goodvibes.batch",
      "goodvibes.discover",
      "goodvibes.status"
    ]
  },
  "configuration": {
    "default": ".goodvibes/config.json",
    "schema": ".claude-plugin/config.schema.json"
  }
}
```

**Migration:**

1. Move `plugin.json` to `.claude-plugin/plugin.json`
2. Update structure to v2 schema
3. Add new fields (engines, categories, mcp_servers, etc.)
4. Update version to 2.0.0

### 5. MCP Configuration

**v1:** `.mcp.json` (Simple)

```json
{
  "mcpServers": {
    "goodvibes": {
      "command": "node",
      "args": ["dist/index.js"],
      "env": {}
    }
  }
}
```

**v2:** `.mcp.json` (Enhanced)

```json
{
  "mcpServers": {
    "plugin_goodvibes_precision-engine": {
      "command": "node",
      "args": [
        "plugins/goodvibes/tools/implementations/precision-engine/dist/index.cjs"
      ],
      "description": "Token-efficient tools for batch operations",
      "tools": [
        "precision_read",
        "precision_write",
        "precision_edit",
        "precision_grep",
        "precision_glob",
        "precision_symbols",
        "precision_exec",
        "precision_fetch",
        "discover"
      ],
      "env": {
        "NODE_ENV": "production"
      }
    },
    "plugin_goodvibes_batch-engine": {
      "command": "node",
      "args": [
        "plugins/goodvibes/tools/implementations/batch-engine/dist/index.cjs"
      ],
      "description": "Batch operation orchestration and execution",
      "tools": [
        "batch",
        "batch_status",
        "batch_list",
        "batch_recover",
        "batch_checkpoints",
        "batch_state"
      ],
      "env": {
        "NODE_ENV": "production",
        "GOODVIBES_ROOT": "."
      }
    },
    "plugin_goodvibes_registry-engine": {
      "command": "node",
      "args": [
        "plugins/goodvibes/tools/implementations/registry-engine/dist/index.cjs"
      ],
      "description": "Search and load skills, agents, tools",
      "tools": [
        "search_skills",
        "search_agents",
        "search_tools",
        "recommend_skills",
        "get_skill_content",
        "get_agent_content",
        "skill_dependencies"
      ]
    },
    "plugin_goodvibes_analysis-engine": {
      "command": "node",
      "args": [
        "plugins/goodvibes/tools/implementations/analysis-engine/dist/index.cjs"
      ],
      "description": "Codebase analysis and validation",
      "tools": [
        "detect_stack",
        "check_versions",
        "scan_patterns",
        "find_dead_code",
        "find_circular_deps",
        "validate_implementation",
        "scan_for_secrets"
      ]
    },
    "plugin_goodvibes_project-engine": {
      "command": "node",
      "args": [
        "plugins/goodvibes/tools/implementations/project-engine/dist/index.cjs"
      ],
      "description": "Project scaffolding and management",
      "tools": [
        "scaffold_project",
        "list_templates",
        "get_database_schema",
        "get_api_routes",
        "upgrade_package"
      ]
    },
    "plugin_goodvibes_frontend-engine": {
      "command": "node",
      "args": [
        "plugins/goodvibes/tools/implementations/frontend-engine/dist/index.cjs"
      ],
      "description": "Frontend analysis and debugging",
      "tools": [
        "get_react_component_tree",
        "analyze_stacking_context",
        "trace_component_state",
        "get_accessibility_tree"
      ]
    }
  }
}
```

**Migration:**

1. Backup existing `.mcp.json`
2. Replace with v2 structure
3. Add all MCP server definitions
4. Update paths to match your installation
5. Set appropriate environment variables

### 6. Project State Directory

**v1:** Mixed structure

```
.goodvibes/
  preferences.json
  agent-config.json
  state.json
  memory/
    decisions.txt
    patterns.txt
```

**v2:** Structured directories

```
.goodvibes/
  config.json              # Main config
  hooks.json               # Hook config
  modes.json               # Mode config (optional)
  templates.json           # Custom templates (optional)

  state/                   # Session state
    session.json
    agents.json
    locks.json
    health.json

  memory/                  # Persistent memory
    decisions.md           # Structured markdown
    patterns.md
    failures.md
    preferences.json
    index.json

  checkpoints/             # Recovery points
    batch_001_20260121_142530/
      files/
      state.json
      metadata.json

  telemetry/               # Metrics
    current.json
    history/
      2026-01-21.json
      2026-01-20.json
    aggregations.json

  logs/                    # Activity logs
    vibecoding.md
    justvibes.md
    activity.md

  cache/                   # Cached analysis
    stack.json
    symbols.json
    deps.json
```

**Migration Script:**

```bash
#!/bin/bash

# Create v2 directory structure
mkdir -p .goodvibes/{state,memory,checkpoints,telemetry/history,logs,cache}

# Migrate old state
if [ -f .goodvibes/state.json ]; then
  cp .goodvibes/state.json .goodvibes/state/session.json
fi

# Migrate old memory
if [ -d .goodvibes/memory ]; then
  mv .goodvibes/memory/*.txt .goodvibes/memory/ || true
fi

# Initialize new files
echo '{"active": {}, "completed": []}' > .goodvibes/state/agents.json
echo '{"locks": []}' > .goodvibes/state/locks.json
echo '{"status": "healthy", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > .goodvibes/state/health.json
```

## Environment-Specific Configuration

### Development

`.goodvibes/config.json`:
```json
{
  "mode": {
    "default": "vibecoding"
  },
  "validation": {
    "auto_typecheck": true,
    "auto_lint": true,
    "auto_test": false
  },
  "recovery": {
    "max_fix_attempts": 5
  }
}
```

### CI/CD

`.goodvibes/config.json`:
```json
{
  "mode": {
    "default": "justvibes"
  },
  "validation": {
    "auto_typecheck": true,
    "auto_lint": true,
    "auto_test": true,
    "on_fail": "rollback"
  },
  "recovery": {
    "max_fix_attempts": 1
  },
  "telemetry": {
    "enabled": true,
    "collect_metrics": true
  }
}
```

### Production

`.goodvibes/config.json`:
```json
{
  "mode": {
    "default": "vibecoding"
  },
  "batch": {
    "default_transaction_mode": "atomic",
    "auto_checkpoint": true,
    "auto_rollback": true
  },
  "validation": {
    "auto_typecheck": true,
    "auto_lint": true,
    "auto_test": true,
    "on_fail": "rollback"
  },
  "recovery": {
    "max_fix_attempts": 0,
    "checkpoint_frequency": "operation"
  }
}
```

## Configuration Schema Validation

**v2 includes JSON schema validation:**

`.claude-plugin/config.schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["version", "project", "mode"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^2\\.0\\.\\d+$"
    },
    "project": {
      "type": "object",
      "required": ["name", "root"],
      "properties": {
        "name": { "type": "string" },
        "root": { "type": "string" },
        "stack": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "mode": {
      "type": "object",
      "required": ["default"],
      "properties": {
        "default": {
          "type": "string",
          "enum": ["vibecoding", "justvibes"]
        }
      }
    }
  }
}
```

**Validate your config:**

```bash
npm install -g ajv-cli

ajv validate \
  -s .claude-plugin/config.schema.json \
  -d .goodvibes/config.json
```

## Migration Checklist

### Pre-Migration

- [ ] Backup all existing config files
- [ ] Document current settings
- [ ] Note any custom configurations
- [ ] Check for project-specific settings

### Migration

- [ ] Create `.goodvibes/config.json` from template
- [ ] Migrate preferences from `preferences.json`
- [ ] Migrate agent settings from `agent-config.json`
- [ ] Create `.goodvibes/hooks.json` (optional)
- [ ] Create `.goodvibes/modes.json` (optional)
- [ ] Move `plugin.json` to `.claude-plugin/plugin.json`
- [ ] Update `.mcp.json` with all MCP servers
- [ ] Create `.lsp.json` (if using TypeScript)
- [ ] Create v2 directory structure
- [ ] Migrate existing state files
- [ ] Delete old config files

### Post-Migration

- [ ] Validate config with schema
- [ ] Test basic batch operation
- [ ] Test agent spawning
- [ ] Test hooks (typecheck, lint)
- [ ] Test recovery (checkpoint, rollback)
- [ ] Verify telemetry collection
- [ ] Verify memory system
- [ ] Test both modes (vibecoding, justvibes)

### Verification Commands

```bash
# Validate configuration
mcp-cli call plugin_goodvibes_project-engine/plugin_status '{}'

# Test batch operation
mcp-cli call plugin_goodvibes_batch-engine/batch_list '{}'

# Check state
mcp-cli call plugin_goodvibes_batch-engine/batch_state '{"operation": "get", "keys": ["session"]}'

# Test hooks
mcp-cli call plugin_goodvibes_batch-engine/batch '{"operations": {"exec": [{"type": "command", "commands": [{"cmd": "npm run typecheck"}]}]}}'
```

## Common Issues

### Issue: Config Not Loading

**Symptom**: Plugin uses default settings, ignores config

**Solution**: Check config location and syntax

```bash
# Verify config exists
ls -la .goodvibes/config.json

# Validate JSON syntax
cat .goodvibes/config.json | jq .

# Check schema validation
ajv validate -s .claude-plugin/config.schema.json -d .goodvibes/config.json
```

### Issue: MCP Servers Not Loading

**Symptom**: Tools not available, "Unknown tool" errors

**Solution**: Check `.mcp.json` paths and build outputs

```bash
# Verify MCP servers exist
ls -la plugins/goodvibes/tools/implementations/*/dist/

# Check MCP server status
mcp-cli servers

# Rebuild if needed
cd plugins/goodvibes/tools/implementations/batch-engine
npm run build
```

### Issue: Hooks Not Running

**Symptom**: Validation skipped, no typecheck/lint

**Solution**: Check hooks.json and commands

```bash
# Verify hooks config
cat .goodvibes/hooks.json

# Test commands manually
npm run typecheck
npm run lint

# Check hook execution in logs
cat .goodvibes/logs/activity.md
```

## Best Practices

### 1. Use Version Control

```bash
# Track config files
git add .goodvibes/config.json
git add .goodvibes/hooks.json
git add .claude-plugin/plugin.json
git add .mcp.json

# Ignore state/cache
echo ".goodvibes/state/" >> .gitignore
echo ".goodvibes/cache/" >> .gitignore
echo ".goodvibes/checkpoints/" >> .gitignore
```

### 2. Document Custom Settings

```json
// .goodvibes/config.json
{
  "version": "2.0.0",
  "_comment": "Custom config for my-app",
  "_notes": [
    "auto_test disabled - tests are slow",
    "max_concurrent set to 3 - memory limited",
    "checkpoint_frequency set to operation - critical data"
  ],
  ...
}
```

### 3. Use Environment-Specific Configs

```bash
# Development
.goodvibes/config.dev.json

# Production
.goodvibes/config.prod.json

# Load based on environment
if [ "$NODE_ENV" = "production" ]; then
  cp .goodvibes/config.prod.json .goodvibes/config.json
fi
```

### 4. Validate After Changes

```bash
# After editing config
ajv validate -s .claude-plugin/config.schema.json -d .goodvibes/config.json

# Test with simple batch
mcp-cli call plugin_goodvibes_batch-engine/batch '{"operations": {"read": [{"type": "files", "targets": ["package.json"]}]}}'
```

## Further Reading

- [Tool Migration Guide](./tool-migration.md)
- [Agent Migration Guide](./agent-migration.md)
- [Configuration Reference](../../SPEC-v2.md#appendix-c-configuration-reference)
- [Hook System](../../SPEC-v2.md#5-lifecycle-hooks)
- [Mode System](../../SPEC-v2.md#10-mode-system)

---

*Last updated: 2026-01-21*
*SPEC version: v2.0.0*
