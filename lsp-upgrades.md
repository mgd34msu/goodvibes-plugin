# LSP Upgrades for GoodVibes Plugin

High-value LSP capabilities for autonomous coding agents.

## High-Value LSP Features for Autonomous Agents

### 1. Find References / Find All Usages

When an agent modifies a function signature, renames a parameter, or changes a type, it needs to know *every* call site. Text-based grep gives false positives and misses dynamic references. Semantic "find references" is essential for safe refactoring.

### 2. Go to Definition / Go to Type Definition

Better than grep for navigating code. When an agent sees `user.settings.theme`, it can semantically jump to the actual type definitions rather than searching for "theme" and getting hundreds of irrelevant matches.

### 3. Rename Symbol

Safe cross-file renaming. When agents refactor, they often rename things - a semantic rename ensures all references are updated correctly, including imports and re-exports.

### 4. Code Actions / Quick Fixes

- **Auto-import** - Agents frequently generate code that uses symbols without importing them
- **Add missing properties** - When implementing interfaces
- **Convert to async/await** - Automatic refactoring suggestions
- **Organize imports** - Clean up after changes

### 5. Call Hierarchy (Incoming/Outgoing)

"Who calls this function?" and "What does this function call?" - Critical for understanding impact before making changes. An agent could check: "If I change this, what's the blast radius?"

### 6. Inlay Hints / Type Inference

See what types TypeScript infers without explicit annotations. Helps agents understand existing code and verify their generated code has correct types.

### 7. Document/Workspace Symbols

Get a structural outline - all classes, functions, interfaces in a file or project. Much faster than parsing files manually to understand structure.

### 8. Signature Help

When generating function calls, get the exact parameter types/order expected. Prevents errors like wrong argument order or missing required params.

---

## Beyond Traditional LSP - Agent-Specific Features

### 9. Impact Analysis

"If I change X, what tests should I run? What modules are affected?" A dependency-aware tool that maps changes to affected code paths.

### 10. Dead Code Detection

"Is this function used anywhere?" Agents often need to clean up or understand if code is safe to remove.

### 11. API Surface Analysis

What's exported vs internal? Helps agents understand public contracts they shouldn't break.

### 12. Breaking Change Detection

"Does my change break the public API?" Compare before/after types and flag incompatible changes.

### 13. Semantic Diff

Not just "lines changed" but "this function's return type changed from `string` to `string | null`" - helps agents understand the semantic impact of their changes.

### 14. Batch Diagnostics with Fixes

Run diagnostics across multiple files and return actionable fixes. Instead of "error on line 42", return "error on line 42, fix by adding `| undefined` to type".

---

## Priority Ranking for Autonomous Coding

| Priority | Feature | Why |
|----------|---------|-----|
| 1 | Find References | Safe refactoring is #1 agent need |
| 2 | Code Actions (auto-import) | Agents constantly forget imports |
| 3 | Call Hierarchy | Impact analysis before changes |
| 4 | Rename Symbol | Safe bulk refactoring |
| 5 | Go to Definition | Semantic navigation > grep |
| 6 | Type Inference/Hover | Verify generated code types |

---

## Summary

The theme: agents need **semantic understanding** over text matching, and **impact awareness** before making changes. Current grep/glob tools work but produce noise and miss edge cases that LSP handles correctly.
