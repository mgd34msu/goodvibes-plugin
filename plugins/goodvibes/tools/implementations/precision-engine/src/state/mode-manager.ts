/**
 * ModeManager — Mode-specific defaults and enforcement for precision tools.
 *
 * Modes come from GoodVibes output styles (vibecoding, justvibes, etc.) and
 * affect default verbosity, extract modes, and enforcement of best practices.
 *
 * Mode detection priority:
 *   1. GOODVIBES_MODE environment variable
 *   2. `.goodvibes/goodvibes.json` `mode` key
 *   3. Fallback: 'default'
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../logging.js';
import { mergeDefaults } from '../utils/index.js';

// ───────────────────────────────────────────────────────────────────────────
// Public interfaces
// ───────────────────────────────────────────────────────────────────────────

/**
 * Verbosity level type shared across tool input/output controls.
 */
export type VerbosityLevel = 'count_only' | 'minimal' | 'standard' | 'verbose';

/**
 * Read extract mode type for precision_read.
 */
export type ReadExtractMode = 'content' | 'outline' | 'symbols' | 'ast' | 'lines';

/**
 * Grep output format type for precision_grep.
 */
export type GrepFormat = 'count_only' | 'files_only' | 'locations' | 'matches' | 'context';

/**
 * Per-mode configuration: defaults for tool inputs and enforcement rules.
 */
export interface ModeConfig {
  /** Mode name identifier. */
  name: string;
  /** Human-readable description. */
  description: string;
  /** Default values applied to tool inputs when the caller does not specify them. */
  defaults: {
    /** Default verbosity for most tools (precision_read, precision_exec, etc.). */
    verbosity: VerbosityLevel;
    /** Default extract mode for precision_read. */
    read_extract: ReadExtractMode;
    /** Default output format for precision_grep. */
    grep_format: GrepFormat;
    /** Default verbosity for precision_write results. */
    write_verbosity: VerbosityLevel;
    /** Default verbosity for precision_edit results. */
    edit_verbosity: VerbosityLevel;
    /** Default verbosity for precision_exec results. */
    exec_verbosity: VerbosityLevel;
  };
  /** Enforcement rules applied on top of tool inputs. */
  enforcement: {
    /** Warn or error if tools are called outside DPB loop structure. */
    require_dpb: boolean;
    /** Warn or error if native tools are used instead of precision equivalents. */
    require_precision_tools: boolean;
    /**
     * Cap applied to verbosity for read operations.
     * Requests above this level are silently capped.
     * null means no cap.
     */
    max_read_verbosity: VerbosityLevel | null;
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Built-in mode definitions
// ───────────────────────────────────────────────────────────────────────────

/**
 * vibecoding: Production mode — enforces DPB loop and precision tools.
 * Writes/edits use count_only (you just wrote the content, no need to re-read).
 * Read verbosity capped at 'standard' to prevent runaway token usage.
 */
const VIBECODING_MODE: ModeConfig = {
  name: 'vibecoding',
  description:
    'Production mode — enforces DPB loop, precision tools, and token-efficient defaults. ' +
    'Write/edit verbosity defaults to count_only. Read verbosity capped at standard.',
  defaults: {
    verbosity: 'standard',
    read_extract: 'outline',
    grep_format: 'files_only',
    write_verbosity: 'count_only',
    edit_verbosity: 'count_only',
    exec_verbosity: 'minimal',
  },
  enforcement: {
    require_dpb: true,
    require_precision_tools: true,
    max_read_verbosity: 'standard',
  },
};

/**
 * justvibes: Relaxed mode — sensible defaults, minimal enforcement.
 * Same defaults as vibecoding but enforcement is advisory only.
 */
const JUSTVIBES_MODE: ModeConfig = {
  name: 'justvibes',
  description:
    'Relaxed mode — same efficient defaults as vibecoding, but enforcement is advisory only. ' +
    'Good for exploration and learning.',
  defaults: {
    verbosity: 'standard',
    read_extract: 'outline',
    grep_format: 'files_only',
    write_verbosity: 'count_only',
    edit_verbosity: 'count_only',
    exec_verbosity: 'minimal',
  },
  enforcement: {
    require_dpb: false,
    require_precision_tools: false,
    max_read_verbosity: null,
  },
};

/**
 * default: Baseline mode — no enforcement, standard defaults.
 * Used when no mode is configured.
 */
const DEFAULT_MODE: ModeConfig = {
  name: 'default',
  description:
    'Baseline mode — no enforcement, standard verbosity defaults. ' +
    'Used when no mode is configured.',
  defaults: {
    verbosity: 'standard',
    read_extract: 'content',
    grep_format: 'matches',
    write_verbosity: 'standard',
    edit_verbosity: 'minimal',
    exec_verbosity: 'standard',
  },
  enforcement: {
    require_dpb: false,
    require_precision_tools: false,
    max_read_verbosity: null,
  },
};

/**
 * Result type for getModeConfig().
 * When the requested mode is unknown, returns a fallback config with `fallback: true`
 * to allow callers to distinguish between a configured mode and a fallback.
 */
export type ModeConfigResult = ModeConfig | (ModeConfig & { fallback: true });

/** All built-in modes, keyed by name. */
const BUILT_IN_MODES: Record<string, ModeConfig> = {
  vibecoding: VIBECODING_MODE,
  justvibes: JUSTVIBES_MODE,
  default: DEFAULT_MODE,
};

// ───────────────────────────────────────────────────────────────────────────
// ModeManager
// ───────────────────────────────────────────────────────────────────────────

/**
 * ModeManager provides mode-specific defaults and enforcement for precision tools.
 *
 * Usage:
 *   const manager = ModeManager.getInstance();
 *   const defaults = manager.getDefaults();  // use for tool input normalization
 *   manager.setMode('vibecoding');            // switch mode at runtime
 *
 * Mode detection (on first getInstance() call):
 *   1. GOODVIBES_MODE env var
 *   2. `.goodvibes/goodvibes.json` `mode` key
 *   3. Fallback: 'default'
 */
export class ModeManager {
  private static instance: ModeManager | null = null;

  /** Current mode name. */
  private currentModeName: string;

  /** Custom modes registered via registerMode(). */
  private customModes: Map<string, ModeConfig> = new Map();

  private constructor(initialMode: string) {
    this.currentModeName = initialMode;
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /**
   * Get or create the singleton ModeManager instance.
   * Detects mode from env var or config file on first call.
   */
  static getInstance(): ModeManager {
    if (!ModeManager.instance) {
      const detectedMode = ModeManager.detectMode();
      ModeManager.instance = new ModeManager(detectedMode);
      logger.debug('[ModeManager] Initialized', { mode: detectedMode });
    }
    return ModeManager.instance;
  }

  /**
   * Reset the singleton instance.
   * Intended for testing only.
   */
  static resetInstance(): void {
    ModeManager.instance = null;
  }

  // ── Mode detection ────────────────────────────────────────────────────────

  /**
   * Detect the initial mode from environment or config file.
   * Priority: GOODVIBES_MODE env var > config file `mode` key > 'default'.
   */
  private static detectMode(): string {
    // 1. Environment variable
    const envMode = process.env.GOODVIBES_MODE;
    if (envMode && envMode.length > 0) {
      logger.debug('[ModeManager] Mode from GOODVIBES_MODE env', { mode: envMode });
      return envMode;
    }

    // 2. Config file
    try {
      const configPath = path.join(process.cwd(), '.goodvibes', 'goodvibes.json');
      const content = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content) as Record<string, unknown>;
      if (typeof parsed.mode === 'string' && parsed.mode.length > 0) {
        logger.debug('[ModeManager] Mode from config file', { mode: parsed.mode });
        return parsed.mode;
      }
    } catch {
      // Config file not found or unreadable — use default
    }

    // 3. Default fallback
    return 'default';
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Get the current mode name.
   */
  getMode(): string {
    return this.currentModeName;
  }

  /**
   * Switch to a named mode.
   * Accepts built-in mode names or custom registered modes.
   * Logs a warning if the mode name is unrecognized but sets it anyway
   * to allow forward-compatibility with future modes.
   */
  setMode(name: string): void {
    const resolvedConfig = this.resolveModeConfig(name);
    if (!resolvedConfig) {
      logger.warn('[ModeManager] Unknown mode — setting anyway (forward-compat)', { mode: name });
    } else {
      logger.info('[ModeManager] Mode changed', {
        from: this.currentModeName,
        to: name,
      });
    }
    this.currentModeName = name;
  }

  /**
   * Get the full ModeConfig for the current mode.
   * Falls back to DEFAULT_MODE if the current mode name is unknown.
   * When falling back, the returned config's `name` reflects the actual
   * config used ('default'), not the requested unknown mode name.
   */
  getModeConfig(): ModeConfigResult {
    const resolved = this.resolveModeConfig(this.currentModeName);
    if (resolved) return resolved;
    return { ...DEFAULT_MODE, fallback: true };
  }

  /**
   * Get the defaults for the current mode.
   */
  getDefaults(): ModeConfig['defaults'] {
    return this.getModeConfig().defaults;
  }

  /**
   * Get the enforcement rules for the current mode.
   */
  getEnforcement(): ModeConfig['enforcement'] {
    return this.getModeConfig().enforcement;
  }

  /**
   * Apply mode defaults to a tool's input object.
   *
   * Only fills in fields that the caller did NOT explicitly set.
   * Fields explicitly set by the caller always take precedence.
   *
   * @param toolName - The tool being called (e.g., 'precision_read', 'precision_write')
   * @param input - The raw input from the caller (may be partial)
   * @returns A new object with mode defaults applied for unset fields
   */
  applyDefaults(toolName: string, input: Record<string, unknown>): Record<string, unknown> {
    const defaults = this.getDefaults();

    // Determine verbosity default for this specific tool
    const verbosityDefault: VerbosityLevel = (() => {
      switch (toolName) {
        case 'precision_write': return defaults.write_verbosity;
        case 'precision_edit':  return defaults.edit_verbosity;
        case 'precision_exec':  return defaults.exec_verbosity;
        default:                return defaults.verbosity;
      }
    })();

    // Use mergeDefaults to apply base verbosity — input values win over defaults
    let result = mergeDefaults(input, { verbosity: verbosityDefault });

    switch (toolName) {
      case 'precision_read': {
        // Apply extract default to each file entry if not set
        if (Array.isArray(result.files)) {
          result = {
            ...result,
            files: (result.files as Record<string, unknown>[]).map((f) =>
              mergeDefaults(f, { extract: defaults.read_extract })
            ),
          };
        }
        // Apply top-level extract default if not set
        result = mergeDefaults(result, { extract: defaults.read_extract });
        break;
      }

      case 'precision_grep': {
        // Apply grep output format default
        if (result.output === undefined) {
          result = mergeDefaults(result, { output: { format: defaults.grep_format } });
        } else if (
          typeof result.output === 'object' &&
          result.output !== null &&
          (result.output as Record<string, unknown>).format === undefined
        ) {
          result = {
            ...result,
            output: mergeDefaults(
              result.output as Record<string, unknown>,
              { format: defaults.grep_format }
            ),
          };
        }
        break;
      }

      default:
        // verbosity already applied via mergeDefaults above
        break;
    }

    // Apply read verbosity cap if enforcement is active
    const enforcement = this.getEnforcement();
    if (
      enforcement.max_read_verbosity !== null &&
      toolName === 'precision_read' &&
      typeof result.verbosity === 'string'
    ) {
      result.verbosity = capVerbosity(
        result.verbosity as VerbosityLevel,
        enforcement.max_read_verbosity,
      );
    }

    return result;
  }

  /**
   * Register a custom mode.
   * Custom modes override built-in modes with the same name.
   */
  registerMode(config: ModeConfig): void {
    this.customModes.set(config.name, config);
    logger.debug('[ModeManager] Registered custom mode', { name: config.name });
  }

  /**
   * List all available mode names (built-in + custom).
   */
  listModes(): string[] {
    const builtIn = Object.keys(BUILT_IN_MODES);
    const custom = Array.from(this.customModes.keys());
    // De-duplicate: custom overrides built-in
    return Array.from(new Set([...builtIn, ...custom]));
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  /**
   * Resolve a mode name to its ModeConfig.
   * Custom modes take precedence over built-in modes.
   * Returns null if the mode name is not found.
   */
  private resolveModeConfig(name: string): ModeConfig | null {
    // Custom modes override built-in
    if (this.customModes.has(name)) {
      return this.customModes.get(name)!;
    }
    return BUILT_IN_MODES[name] ?? null;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// Utility functions
// ───────────────────────────────────────────────────────────────────────────

/**
 * Verbosity level ordering for cap enforcement.
 * Higher index = more verbose.
 */
const VERBOSITY_ORDER: VerbosityLevel[] = ['count_only', 'minimal', 'standard', 'verbose'];

/**
 * Cap a verbosity level at a maximum allowed level.
 * If the requested level exceeds the cap, returns the cap.
 *
 * @param requested - The verbosity level requested by the caller
 * @param max - The maximum allowed verbosity level
 * @returns The capped verbosity level
 */
export function capVerbosity(requested: VerbosityLevel, max: VerbosityLevel): VerbosityLevel {
  const requestedIdx = VERBOSITY_ORDER.indexOf(requested);
  const maxIdx = VERBOSITY_ORDER.indexOf(max);
  if (requestedIdx === -1 || maxIdx === -1) return requested; // unknown level — pass through
  return requestedIdx <= maxIdx ? requested : max;
}
