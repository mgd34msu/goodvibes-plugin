/**
 * HooksManager — Precision Engine Hooks System (Phase 4G)
 *
 * Provides four unified hook events that fire around every precision tool call:
 *
 * - PrePrecisionTool:  Before ANY tool call (abort capability)
 * - PostPrecisionTool: After successful tool call (telemetry, caching)
 * - OnPrecisionError:  On tool failure (failure logging)
 * - OnPrecisionMutation: After write/edit/exec/file_op (index, cache invalidation)
 *
 * Hook types:
 * - builtin: In-process function call (fastest, integrated with engine state)
 * - script:  Shell command via child_process.exec (custom validation, formatting)
 * - mcp:     Cross-engine coordination (placeholder — logs warning)
 *
 * Design goals:
 * 1. Hooks MUST NOT crash tool execution — every hook path is try/catch guarded.
 * 2. Built-in hooks are active by default, even without config in goodvibes.json.
 * 3. PrePrecisionTool hooks run sequentially; abort if any returns { abort: true }.
 * 4. Script hooks use exec with 5s timeout and {{path}} template substitution.
 * 5. Graceful degradation: if config load fails, fall back to built-in hooks only.
 */

import { exec } from 'child_process';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import { logger } from '../logging.js';
import { projectIndex } from './project-index.js';
import { FileStateCache } from './file-cache.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** The four hook event types (CamelCase to match Claude Code convention). */
export type HookEvent =
  | 'PrePrecisionTool'
  | 'PostPrecisionTool'
  | 'OnPrecisionError'
  | 'OnPrecisionMutation';

/** Hook implementation type. */
export type HookType = 'builtin' | 'script' | 'mcp';

/**
 * Hook filter — controls which tool calls this hook applies to.
 * If undefined, the hook applies to all tool calls.
 */
export interface HookFilter {
  /** Array of tool short-names (e.g. 'read', 'write', 'edit', 'exec'). */
  tool?: string[];
}

/**
 * Configuration for a single hook instance.
 * Stored in goodvibes.json under `hooks.<event>[]`.
 */
export interface HookConfig {
  /** Hook implementation type. */
  type: HookType;
  /** Built-in hook identifier (for type='builtin'). */
  name?: string;
  /** Shell command template (for type='script'). Supports {{path}} substitution. */
  cmd?: string;
  /** MCP tool name (for type='mcp'). Currently logs a warning — future feature. */
  mcp_tool?: string;
  /** Filter to scope hook to specific tools. Omit to apply to all tools. */
  filter?: HookFilter;
  /** Whether this hook is active. Defaults to true. */
  enabled?: boolean;
  /** Timeout in milliseconds for script hooks (default: 5000). */
  timeout_ms?: number;
}

/**
 * Minimal interface for the PrecisionRuntime reference passed through HookContext.
 * Defined here (rather than imported) to avoid circular dependencies between
 * hooks.ts and precision-runtime.ts.
 */
export interface IPrecisionRuntime {
  readonly session: { id: string; startedAt: string; toolCalls: number };
  generateId(tool: string): string;
  getSessionId(): string;
  getState(keys: string[]): Promise<Record<string, unknown>>;
  setState(values: Record<string, unknown>): Promise<void>;
}

/**
 * Runtime context passed to every hook invocation.
 */
export interface HookContext {
  /** The call's unique precision_id (e.g. 'write_a1b2c3d4_e5f6a7b8'). */
  precision_id: string;
  /** Tool short name (e.g. 'read', 'write', 'edit', 'exec'). */
  tool_name: string;
  /** Full tool name as registered (e.g. 'precision_write'). */
  full_tool_name: string;
  /** Raw tool input parameters. */
  input: unknown;
  /** Tool result (PostPrecisionTool only). */
  result?: unknown;
  /** Error instance (OnPrecisionError only). */
  error?: Error;
  /** Files affected by a mutation (OnPrecisionMutation only). */
  paths_affected?: string[];
  /** Active session metadata — optional, absent in degraded mode. */
  session?: { id: string; startedAt: string; toolCalls: number };
  /** PrecisionRuntime reference — optional, absent in degraded mode. */
  runtime?: IPrecisionRuntime;
}

/**
 * Return value from Pre-hooks. Returning { abort: true } cancels the tool call.
 */
export interface HookResult {
  /** If true, cancel the tool call and return the reason to the caller. */
  abort?: boolean;
  /** Human-readable reason for the abort (displayed to the LLM). */
  reason?: string;
}

/**
 * Internal registry entry for a built-in hook handler function.
 */
export type BuiltinHookHandler = (context: HookContext) => Promise<HookResult | void>;

// ─────────────────────────────────────────────────────────────────────────────
// Tools that trigger OnPrecisionMutation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Short tool names that perform mutations (write, edit, exec with file_ops).
 * OnPrecisionMutation fires after successful calls to any of these tools.
 */
const MUTATION_TOOLS = new Set(['write', 'edit', 'exec', 'file_op', 'notebook']);

// ─────────────────────────────────────────────────────────────────────────────
// Default built-in hook configuration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default built-in hooks that are active even without config in goodvibes.json.
 * These provide essential engine integrations (telemetry is handled in executeHandler).
 */
const DEFAULT_BUILTIN_HOOKS: Record<HookEvent, HookConfig[]> = {
  PrePrecisionTool: [],
  PostPrecisionTool: [
    { type: 'builtin', name: 'record_telemetry', enabled: true },
  ],
  OnPrecisionError: [
    { type: 'builtin', name: 'log_failure', enabled: true },
  ],
  OnPrecisionMutation: [
    { type: 'builtin', name: 'update_index', enabled: true },
    { type: 'builtin', name: 'invalidate_cache', enabled: true },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// HooksManager
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HooksManager — singleton that manages hook registration and execution.
 *
 * Usage:
 *   const hooks = HooksManager.getInstance();
 *   await hooks.loadFromConfig();  // call once during runtime init
 *
 *   // In executeHandler:
 *   const preResult = await hooks.runPreHooks(context);
 *   if (preResult.abort) throw new HookAbortError(preResult.reason);
 */
export class HooksManager {
  private static instance: HooksManager | null = null;

  /** Merged hook map: event → ordered list of configs (defaults + user config). */
  private hooks: Record<HookEvent, HookConfig[]>;

  /** Registry of built-in hook implementations. */
  private readonly builtins: Map<string, BuiltinHookHandler>;

  private constructor() {
    // Start with deep-cloned defaults (prevents shared reference mutation)
    this.hooks = this.cloneDefaultHooks();
    this.builtins = this.registerBuiltins();
  }

  /** Deep-clone DEFAULT_BUILTIN_HOOKS to prevent shared object references. */
  private cloneDefaultHooks(): Record<HookEvent, HookConfig[]> {
    const cloneHook = (h: HookConfig): HookConfig => ({
      ...h,
      filter: h.filter ? { ...h.filter, tool: [...(h.filter.tool ?? [])] } : undefined,
    });
    return {
      PrePrecisionTool: DEFAULT_BUILTIN_HOOKS.PrePrecisionTool.map(cloneHook),
      PostPrecisionTool: DEFAULT_BUILTIN_HOOKS.PostPrecisionTool.map(cloneHook),
      OnPrecisionError: DEFAULT_BUILTIN_HOOKS.OnPrecisionError.map(cloneHook),
      OnPrecisionMutation: DEFAULT_BUILTIN_HOOKS.OnPrecisionMutation.map(cloneHook),
    };
  }

  /** Get (or create) the singleton HooksManager instance. */
  public static getInstance(): HooksManager {
    if (!HooksManager.instance) {
      HooksManager.instance = new HooksManager();
    }
    return HooksManager.instance;
  }

  /** Reset the singleton (for testing). */
  public static resetInstance(): void {
    HooksManager.instance = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Configuration loading
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Load hook configuration from goodvibes.json.
   *
   * User-configured hooks are APPENDED after the built-in defaults.
   * If loading fails (missing file, bad JSON), falls back to built-in hooks only.
   *
   * This method is idempotent — calling it again reloads from disk.
   */
  public async loadFromConfig(): Promise<void> {
    const configPath = path.join(process.cwd(), '.goodvibes', 'goodvibes.json');

    try {
      if (!existsSync(configPath)) {
        logger.debug('[HooksManager] No goodvibes.json found — using built-in hooks only');
        return;
      }

      const raw = await readFile(configPath, 'utf-8');
      const config = JSON.parse(raw) as Record<string, unknown>;
      const hooksConfig = config.hooks as Record<string, unknown> | undefined;

      if (!hooksConfig || typeof hooksConfig !== 'object') {
        logger.debug('[HooksManager] No hooks config found in goodvibes.json — using built-in hooks only');
        return;
      }

      // Reset to deep-cloned defaults before applying user config
      this.hooks = this.cloneDefaultHooks();

      // Merge user-configured hooks (appended after defaults)
      const events: HookEvent[] = [
        'PrePrecisionTool',
        'PostPrecisionTool',
        'OnPrecisionError',
        'OnPrecisionMutation',
      ];

      for (const event of events) {
        const userHooks = hooksConfig[event];
        if (Array.isArray(userHooks)) {
          for (const hookCfg of userHooks) {
            if (hookCfg && typeof hookCfg === 'object') {
              // Don't duplicate built-in hooks that are already in defaults
              const cfg = hookCfg as HookConfig;
              const isDuplicateBuiltin =
                cfg.type === 'builtin' &&
                this.hooks[event].some(
                  (h) => h.type === 'builtin' && h.name === cfg.name,
                );
              if (!isDuplicateBuiltin) {
                this.hooks[event].push(cfg);
              } else {
                // User can override enabled flag on existing built-in
                const existing = this.hooks[event].find(
                  (h) => h.type === 'builtin' && h.name === cfg.name,
                );
                if (existing && cfg.enabled !== undefined) {
                  existing.enabled = cfg.enabled;
                }
              }
            }
          }
        }
      }

      logger.debug('[HooksManager] Config loaded', {
        events: events.map((e) => `${e}:${this.hooks[e].length}`).join(', '),
      });
    } catch (err) {
      logger.warn('[HooksManager] Failed to load config — using built-in hooks only', {
        err: err instanceof Error ? err.message : String(err),
      });
      // Reset to deep-cloned defaults on error
      this.hooks = this.cloneDefaultHooks();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hook execution
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Run PrePrecisionTool hooks sequentially.
   *
   * Returns { abort: true, reason } if any hook requests abort.
   * Returns {} (no abort) if all hooks pass.
   * Hook errors are caught and logged — they do NOT abort the tool call.
   */
  public async runPreHooks(context: HookContext): Promise<HookResult> {
    const hooks = this.getEnabledHooks('PrePrecisionTool', context.tool_name);

    for (const hook of hooks) {
      try {
        const result = await this.executeHook(hook, context);
        if (result?.abort) {
          logger.info('[HooksManager] PrePrecisionTool hook aborted tool call', {
            hook: hook.name ?? hook.cmd,
            tool: context.tool_name,
            reason: result.reason,
          });
          return { abort: true, reason: result.reason };
        }
      } catch (err) {
        // Hook errors MUST NOT crash tool execution
        logger.warn('[HooksManager] PrePrecisionTool hook error (ignoring)', {
          hook: hook.name ?? hook.cmd,
          tool: context.tool_name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return {};
  }

  /**
   * Run PostPrecisionTool hooks sequentially.
   *
   * Hooks receive the tool result. Errors are caught and logged.
   * No abort capability — tool has already completed.
   */
  public async runPostHooks(context: HookContext): Promise<void> {
    const hooks = this.getEnabledHooks('PostPrecisionTool', context.tool_name);

    for (const hook of hooks) {
      try {
        await this.executeHook(hook, context);
      } catch (err) {
        logger.warn('[HooksManager] PostPrecisionTool hook error (ignoring)', {
          hook: hook.name ?? hook.cmd,
          tool: context.tool_name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Run OnPrecisionError hooks sequentially.
   *
   * Hooks receive the error context. Internal hook errors are caught and logged.
   */
  public async runErrorHooks(context: HookContext): Promise<void> {
    const hooks = this.getEnabledHooks('OnPrecisionError', context.tool_name);

    for (const hook of hooks) {
      try {
        await this.executeHook(hook, context);
      } catch (err) {
        logger.warn('[HooksManager] OnPrecisionError hook error (ignoring)', {
          hook: hook.name ?? hook.cmd,
          tool: context.tool_name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Run OnPrecisionMutation hooks sequentially.
   *
   * Fires after write/edit/exec/file_op completes. Consolidates index updates.
   * Errors are caught and logged.
   */
  public async runMutationHooks(context: HookContext): Promise<void> {
    const hooks = this.getEnabledHooks('OnPrecisionMutation', context.tool_name);

    for (const hook of hooks) {
      try {
        await this.executeHook(hook, context);
      } catch (err) {
        logger.warn('[HooksManager] OnPrecisionMutation hook error (ignoring)', {
          hook: hook.name ?? hook.cmd,
          tool: context.tool_name,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  /**
   * Whether a tool call is a mutation (should fire OnPrecisionMutation).
   */
  public isMutationTool(toolName: string): boolean {
    return MUTATION_TOOLS.has(toolName);
  }

  /**
   * Whether a named hook in the given event is enabled.
   * Used to allow external code (e.g. executeHandler) to gate behavior
   * based on hook enabled state.
   */
  public isHookEnabled(event: HookEvent, name: string): boolean {
    const hooks = this.hooks[event] ?? [];
    const hook = hooks.find((h) => h.name === name);
    return hook !== undefined && hook.enabled !== false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Management API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * List all hooks, optionally filtered by event.
   */
  public listHooks(event?: HookEvent): Record<string, HookConfig[]> | HookConfig[] {
    if (event) {
      return this.hooks[event] ?? [];
    }
    return { ...this.hooks };
  }

  /**
   * Enable a hook by event + name.
   * Returns true if the hook was found and enabled, false otherwise.
   */
  public enableHook(event: HookEvent, name: string): boolean {
    const hooks = this.hooks[event];
    const hook = hooks?.find((h) => h.name === name || h.cmd === name);
    if (hook) {
      hook.enabled = true;
      return true;
    }
    return false;
  }

  /**
   * Disable a hook by event + name.
   * Returns true if the hook was found and disabled, false otherwise.
   */
  public disableHook(event: HookEvent, name: string): boolean {
    const hooks = this.hooks[event];
    const hook = hooks?.find((h) => h.name === name || h.cmd === name);
    if (hook) {
      hook.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Add a new hook to an event.
   * Validates the hook config before adding.
   */
  public addHook(event: HookEvent, hookConfig: HookConfig): void {
    if (!hookConfig.type) {
      throw new Error('Hook config must have a type (builtin, script, or mcp)');
    }
    if (!(['builtin', 'script', 'mcp'] as HookType[]).includes(hookConfig.type)) {
      throw new Error(`Invalid hook type '${hookConfig.type}': must be 'builtin', 'script', or 'mcp'`);
    }
    if (hookConfig.type === 'builtin' && !hookConfig.name) {
      throw new Error('Builtin hooks must have a name');
    }
    if (hookConfig.type === 'script' && !hookConfig.cmd) {
      throw new Error('Script hooks must have a cmd');
    }

    const normalized: HookConfig = { enabled: true, ...hookConfig };
    this.hooks[event].push(normalized);
  }

  /**
   * Remove a hook from an event by name or cmd.
   * Returns true if found and removed, false otherwise.
   */
  public removeHook(event: HookEvent, name: string): boolean {
    const hooks = this.hooks[event];
    const idx = hooks?.findIndex((h) => h.name === name || h.cmd === name);
    if (idx !== undefined && idx >= 0) {
      hooks.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Persist current hook configuration to goodvibes.json.
   * Merges only user-added/modified hooks (not built-in defaults) into the file.
   */
  public async persistToConfig(): Promise<void> {
    const configPath = path.join(process.cwd(), '.goodvibes', 'goodvibes.json');

    let existing: Record<string, unknown> = {};
    try {
      if (existsSync(configPath)) {
        const raw = await readFile(configPath, 'utf-8');
        existing = JSON.parse(raw) as Record<string, unknown>;
      }
    } catch (error) {
      console.warn('[HooksManager] Failed to read existing config during persist:', error);
      // Start fresh if config is corrupt
    }

    // Only persist user-modified/added hooks — not built-in defaults
    const userHooks: Record<string, HookConfig[]> = {};
    for (const [event, hooks] of Object.entries(this.hooks)) {
      const defaultNames = new Set(
        DEFAULT_BUILTIN_HOOKS[event as HookEvent]?.map((h) => h.name) ?? [],
      );
      const userModified = hooks.filter((h) => {
        if (!h.name || !defaultNames.has(h.name)) return true; // user-added
        const defaultHook = DEFAULT_BUILTIN_HOOKS[event as HookEvent]?.find(
          (d) => d.name === h.name,
        );
        return defaultHook !== undefined && h.enabled !== defaultHook.enabled; // user-modified enabled flag
      });
      if (userModified.length > 0) userHooks[event] = userModified;
    }

    existing.hooks = userHooks;

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, JSON.stringify(existing, null, 2), 'utf-8');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get enabled hooks for an event that match the given tool name.
   */
  private getEnabledHooks(event: HookEvent, toolName: string): HookConfig[] {
    const allHooks = this.hooks[event] ?? [];
    return allHooks.filter(
      (h) => h.enabled !== false && this.matchesFilter(h, toolName),
    );
  }

  /**
   * Check if a hook's filter matches the given tool name.
   * If no filter is defined, the hook applies to all tools.
   */
  private matchesFilter(hook: HookConfig, toolName: string): boolean {
    if (!hook.filter?.tool || hook.filter.tool.length === 0) {
      return true; // No filter = apply to all tools
    }
    return hook.filter.tool.includes(toolName);
  }

  /**
   * Dispatch a single hook to its implementation.
   */
  private async executeHook(
    hook: HookConfig,
    context: HookContext,
  ): Promise<HookResult | void> {
    switch (hook.type) {
      case 'builtin':
        return this.executeBuiltinHook(hook, context);
      case 'script':
        return this.executeScriptHook(hook, context);
      case 'mcp':
        return this.executeMcpHook(hook, context);
      default: {
        const exhaustive: never = hook.type;
        logger.warn('[HooksManager] Unknown hook type', { type: exhaustive });
      }
    }
  }

  /**
   * Execute a built-in hook by looking up its handler in the registry.
   */
  private async executeBuiltinHook(
    hook: HookConfig,
    context: HookContext,
  ): Promise<HookResult | void> {
    const name = hook.name ?? '';
    const handler = this.builtins.get(name);

    if (!handler) {
      logger.warn('[HooksManager] Unknown built-in hook name', { name });
      return;
    }

    return handler(context);
  }

  /**
   * Shell-escape a string value for safe substitution into a shell command.
   * Uses single-quote wrapping with internal single-quote escaping.
   */
  private shellEscape(s: string): string {
    return "'" + s.replace(/'/g, "'\\''" ) + "'";
  }

  /**
   * Execute a script hook via child_process.exec (shell-based).
   *
   * Template substitution (all values shell-escaped):
   * - {{path}}: replaced with the first affected path (if any)
   * - {{tool}}: replaced with the tool short-name
   * - {{precision_id}}: replaced with the precision_id
   *
   * Using exec (not execFile) so the shell handles quoting in the command.
   * All template values are shell-escaped to prevent injection.
   * Timeout: hook.timeout_ms or 5000ms default.
   */
  private executeScriptHook(
    hook: HookConfig,
    context: HookContext,
  ): Promise<HookResult | void> {
    const rawCmd = hook.cmd ?? '';
    const firstPath = context.paths_affected?.[0] ?? '';

    // Template substitution with shell-escaping for all injected values
    const cmd = rawCmd
      .replace(/\{\{path\}\}/g, this.shellEscape(firstPath))
      .replace(/\{\{tool\}\}/g, this.shellEscape(context.tool_name))
      .replace(/\{\{precision_id\}\}/g, this.shellEscape(context.precision_id));

    const timeoutMs = hook.timeout_ms ?? 5000;

    if (!cmd.trim()) {
      logger.warn('[HooksManager] Script hook has empty command', { hook: hook.cmd });
      return Promise.resolve();
    }

    return new Promise<HookResult | void>((resolve) => {
      // Use exec (shell-based) so the shell handles quoting natively.
      // The built-in timeout kills the process and invokes the callback with an error.
      const child = exec(cmd, { timeout: timeoutMs, cwd: process.cwd() }, (error, stdout, stderr) => {
        if (error) {
          logger.warn('[HooksManager] Script hook failed', {
            cmd: hook.cmd,
            err: error.message,
            stderr: stderr.slice(0, 200),
          });
        } else {
          logger.debug('[HooksManager] Script hook completed', {
            cmd: hook.cmd,
            stdout: stdout.slice(0, 200),
          });
        }
        resolve();
      });

      // Ensure the child process reference is used (prevents potential GC issues)
      child.on('error', () => { /* handled by callback */ });
    });
  }

  /**
   * MCP hook execution — placeholder for future cross-engine coordination.
   * Logs a warning and returns without doing anything.
   */
  private executeMcpHook(
    hook: HookConfig,
    context: HookContext,
  ): Promise<HookResult | void> {
    logger.warn('[HooksManager] MCP hook type is not yet implemented — skipping', {
      mcp_tool: hook.mcp_tool,
      tool: context.tool_name,
      precision_id: context.precision_id,
    });
    return Promise.resolve();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Built-in hook implementations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register all built-in hook implementations.
   */
  private registerBuiltins(): Map<string, BuiltinHookHandler> {
    const map = new Map<string, BuiltinHookHandler>();

    /**
     * record_telemetry — PostPrecisionTool
     *
     * Note: Telemetry recording is handled directly in executeHandler in src/index.ts
     * for precise timing. This built-in is a no-op placeholder that ensures the
     * hook slot exists for users who want to reference it in config (e.g. to disable it).
     * Future: migrate telemetry recording here when hook system matures.
     */
    map.set('record_telemetry', async (_context: HookContext): Promise<void> => {
      // Telemetry is recorded in executeHandler for precise timing.
      // This hook exists for configuration reference — no-op by design.
    });

    /**
     * update_index — OnPrecisionMutation
     *
     * Updates the ProjectIndex for each affected file path.
     * Uses upsertFile for writes/copies, touchFile for edits.
     * Silently skips if the index is not loaded.
     */
    map.set('update_index', async (context: HookContext): Promise<void> => {
      const paths = context.paths_affected;
      if (!paths || paths.length === 0) return;

      try {
        const index = projectIndex;

        for (const filePath of paths) {
          // Convert absolute paths to relative for the index
          const relativePath = path.isAbsolute(filePath)
            ? path.relative(process.cwd(), filePath)
            : filePath;

          if (context.tool_name === 'write') {
            // Stat the file to get accurate token estimate
            try {
              const fileStat = await stat(path.resolve(process.cwd(), relativePath));
              index.upsertFile(relativePath, Math.ceil(fileStat.size / 4));
            } catch {
              index.upsertFile(relativePath);
            }
          } else {
            index.touchFile(relativePath);
          }
        }
      } catch (err) {
        logger.warn('[HooksManager] update_index hook failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    /**
     * invalidate_cache — OnPrecisionMutation
     *
     * Clears FileStateCache entries for all affected file paths.
     * Prevents stale cache hits after writes/edits.
     */
    map.set('invalidate_cache', async (context: HookContext): Promise<void> => {
      const paths = context.paths_affected;
      if (!paths || paths.length === 0) return;

      try {
        const cache = FileStateCache.getInstance();

        for (const filePath of paths) {
          cache.invalidate(filePath);
        }
      } catch (err) {
        logger.warn('[HooksManager] invalidate_cache hook failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    /**
     * log_failure — OnPrecisionError
     *
     * Appends failure records to .goodvibes/memory/failures.json.
     * Failures older than the 100 most recent are trimmed.
     * Never throws — failure logging must not compound an existing error.
     */
    map.set('log_failure', async (context: HookContext): Promise<void> => {
      const failuresPath = path.join(
        process.cwd(),
        '.goodvibes',
        'memory',
        'failures.json',
      );

      try {
        let failures: unknown[] = [];

        try {
          if (existsSync(failuresPath)) {
            const raw = await readFile(failuresPath, 'utf-8');
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              failures = parsed;
            } else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).failures)) {
              failures = (parsed as Record<string, unknown>).failures as unknown[];
            }
          }
        } catch {
          // Ignore JSON parse error for corrupt failures.json — will overwrite
          failures = [];
        }

        const entry = {
          timestamp: new Date().toISOString(),
          precision_id: context.precision_id,
          tool: context.full_tool_name,
          error: context.error?.message ?? 'Unknown error',
          error_type: context.error?.constructor?.name ?? 'Error',
        };

        failures.push(entry);

        // Keep only the 100 most recent failures
        if (failures.length > 100) {
          failures = failures.slice(-100);
        }

        await mkdir(path.dirname(failuresPath), { recursive: true });
        await writeFile(failuresPath, JSON.stringify(failures, null, 2), 'utf-8');
      } catch (err) {
        // Never throw from failure logger
        logger.warn('[HooksManager] log_failure hook encountered an internal error', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    });

    return map;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Error class for hook-aborted tool calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thrown by executeHandler when a PrePrecisionTool hook returns abort: true.
 */
export class HookAbortError extends Error {
  readonly reason: string;

  constructor(reason?: string) {
    const msg = reason ?? 'Tool call aborted by hook';
    super(msg);
    this.name = 'HookAbortError';
    this.reason = msg;
  }
}
