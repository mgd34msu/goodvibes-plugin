/**
 * Context Gathering implementation for Batch Engine
 * @see SPEC-v2 Section 6
 */

import * as path from 'path';
import type {
  Context,
  SessionContext,
  BatchContext,
  OperationContext,
  AgentContext,
  Decision,
  Pattern,
  Failure,
} from '../interfaces/context.js';
import type {
  GatheringPhase,
  GatheringStep,
  GATHERING_STEPS,
  ContextGatherer,
  GatheringResult,
} from '../interfaces/context-gathering.js';
import type { OperationResult } from '../interfaces/result.js';
import type { StateManager } from '../interfaces/state-api.js';
import type { MemoryManager } from '../interfaces/memory-api.js';
import type { TemplateString, TemplateContext } from '../interfaces/template.js';
import { getStateManager } from './state.js';
import { getMemoryManager } from './memory.js';
import { resolveTemplate, hasTemplates } from './template-resolver.js';

/**
 * Cache for expensive operations
 */
interface ContextCache {
  stack?: SessionContext['stack'];
  stack_timestamp?: string;
  health?: SessionContext['health'];
  health_timestamp?: string;
}

/**
 * Helper to execute MCP tool calls
 */
async function executeMCPTool(server: string, tool: string, params: Record<string, unknown>): Promise<any> {
  // This would integrate with the MCP client
  // For now, we'll implement the actual logic needed for each tool

  if (server === 'plugin_goodvibes_analysis-engine') {
    if (tool === 'detect_stack') {
      return detectStackFallback(params.path as string || '.');
    }
  }

  throw new Error(`MCP tool ${server}/${tool} not available`);
}

/**
 * Fallback stack detection using package.json analysis
 */
async function detectStackFallback(projectPath: string): Promise<{
  languages: string[];
  frameworks: string[];
  libraries: string[];
  tools: string[];
}> {
  const fs = await import('fs/promises');
  const packageJsonPath = path.join(projectPath, 'package.json');

  const stack = {
    languages: ['typescript', 'javascript'],
    frameworks: [] as string[],
    libraries: [] as string[],
    tools: [] as string[],
  };

  try {
    const content = await fs.readFile(packageJsonPath, 'utf-8');
    const pkg = JSON.parse(content);
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };

    // Detect frameworks
    if (deps['next']) stack.frameworks.push('nextjs');
    if (deps['react']) stack.frameworks.push('react');
    if (deps['vue']) stack.frameworks.push('vue');
    if (deps['svelte']) stack.frameworks.push('svelte');
    if (deps['@remix-run/react']) stack.frameworks.push('remix');
    if (deps['astro']) stack.frameworks.push('astro');

    // Detect major libraries
    if (deps['@trpc/server']) stack.libraries.push('trpc');
    if (deps['prisma']) stack.libraries.push('prisma');
    if (deps['drizzle-orm']) stack.libraries.push('drizzle');
    if (deps['graphql']) stack.libraries.push('graphql');
    if (deps['tailwindcss']) stack.libraries.push('tailwindcss');

    // Detect tools
    if (deps['typescript']) stack.tools.push('typescript');
    if (deps['eslint']) stack.tools.push('eslint');
    if (deps['prettier']) stack.tools.push('prettier');
    if (deps['vitest'] || deps['jest']) stack.tools.push('testing');

    // Detect languages
    if (deps['typescript']) {
      stack.languages = ['typescript', 'javascript'];
    } else {
      stack.languages = ['javascript'];
    }
  } catch {
    // Fallback to defaults if package.json not found
  }

  return stack;
}

/**
 * Execute git command
 */
async function executeGitCommand(args: string[]): Promise<string> {
  const { execFile } = await import('child_process');
  const { promisify } = await import('util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync('git', args, { encoding: 'utf-8' });
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * Execute a command and return exit code
 */
async function executeCommand(cmd: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);

  try {
    const { stdout, stderr } = await execAsync(cmd, { encoding: 'utf-8' });
    return { exitCode: 0, stdout, stderr };
  } catch (error: any) {
    return {
      exitCode: error.code || 1,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

/**
 * Parse git status output to get dirty state
 */
function parseGitStatus(output: string): boolean {
  return output.trim().length > 0;
}

/**
 * ContextGatherer implementation
 */
export class ContextGathererImpl implements ContextGatherer {
  private stateManager: StateManager;
  private memoryManager: MemoryManager;
  private projectRoot: string;
  private cache: ContextCache = {};
  private batchResults: Map<string, Map<string, OperationResult>> = new Map();

  constructor(
    projectRoot: string = process.cwd(),
    stateManager?: StateManager,
    memoryManager?: MemoryManager
  ) {
    this.projectRoot = projectRoot;
    this.stateManager = stateManager || getStateManager(projectRoot);
    this.memoryManager = memoryManager || getMemoryManager(projectRoot);
  }

  // =========================================================================
  // Public API - Main Gathering Methods
  // =========================================================================

  async gatherSessionContext(): Promise<SessionContext> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Run all session_start gathering steps in parallel where possible
      const [stack, git, health, preferences] = await Promise.all([
        this.detectStack().catch(e => { errors.push(`detectStack: ${e.message}`); return this.getDefaultStack(); }),
        this.loadGitStatus().catch(e => { errors.push(`loadGitStatus: ${e.message}`); return this.getDefaultGit(); }),
        this.checkHealth().catch(e => { errors.push(`checkHealth: ${e.message}`); return this.getDefaultHealth(); }),
        this.loadPreferences().catch(e => { errors.push(`loadPreferences: ${e.message}`); return {}; }),
      ]);

      const session = this.stateManager.getSession();

      const context: SessionContext = {
        id: session.id,
        started_at: session.started_at,
        mode: session.mode,
        project_root: this.projectRoot,
        project_name: path.basename(this.projectRoot),
        stack,
        git,
        health,
        preferences,
      };

      return context;
    } catch (error: any) {
      throw new Error(`Failed to gather session context: ${error.message}`);
    }
  }

  async gatherBatchContext(batch_id: string): Promise<BatchContext> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Run all batch_start gathering steps
      const scope = await this.analyzeScope(batch_id)
        .catch(e => { errors.push(`analyzeScope: ${e.message}`); return { files: [], symbols: [] }; });

      const memory = await this.loadRelevantMemory(scope.files, scope.symbols)
        .catch(e => { errors.push(`loadRelevantMemory: ${e.message}`); return { decisions: [], patterns: [], failures: [] }; });

      const risk = await this.assessRisk(scope.files, memory.failures)
        .catch(e => { errors.push(`assessRisk: ${e.message}`); return { level: 'medium' as const, factors: [] }; });

      const dependencies = await this.resolveDependencies(batch_id)
        .catch(e => { errors.push(`resolveDependencies: ${e.message}`); return new Map(); });

      const context: BatchContext = {
        decisions: memory.decisions,
        patterns: memory.patterns,
        failures: memory.failures,
        affected_files: scope.files,
        affected_symbols: scope.symbols,
        resolved_dependencies: dependencies,
        risk,
      };

      return context;
    } catch (error: any) {
      throw new Error(`Failed to gather batch context: ${error.message}`);
    }
  }

  async gatherOperationContext(operation_id: string): Promise<OperationContext> {
    const startTime = Date.now();

    try {
      // Get the batch_id from the operation_id (format: batch_id:operation_id)
      const [batch_id, op_id] = operation_id.split(':');

      // Get prior results for this batch
      const priorResults = this.batchResults.get(batch_id ?? '') || new Map();

      // Resolve any template injections
      const injected = await this.resolveInjections(operation_id, priorResults);

      const context: OperationContext = {
        id: operation_id,
        type: 'unknown', // Will be set by the operation executor
        injected,
        prior_results: priorResults,
      };

      return context;
    } catch (error: any) {
      throw new Error(`Failed to gather operation context: ${error.message}`);
    }
  }

  async gatherAgentContext(agent_id: string): Promise<AgentContext> {
    const startTime = Date.now();

    try {
      // Build agent prompt and inject context
      const agentState = this.stateManager.getActiveAgents().find(a => a.id === agent_id);
      if (!agentState) {
        throw new Error(`Agent ${agent_id} not found`);
      }

      // Get batch context to inject relevant memory
      const batchContext = await this.gatherBatchContext(agentState.batch_id);

      // Get prior results
      const priorResults = this.batchResults.get(agentState.batch_id) || new Map();
      const priorResultsObj: Record<string, unknown> = {};
      priorResults.forEach((value, key) => {
        priorResultsObj[key] = value.data;
      });

      const context: AgentContext = {
        task: agentState.task,
        scope: batchContext.affected_files,
        constraints: [], // TODO: Extract from batch config
        relevant_decisions: batchContext.decisions,
        relevant_patterns: batchContext.patterns,
        past_failures: batchContext.failures,
        prior_results: priorResultsObj,
        budget: {
          tokens_remaining: agentState.budget.max_tokens - agentState.budget.tokens_used,
          turns_remaining: agentState.budget.max_turns - agentState.budget.turns_used,
        },
      };

      return context;
    } catch (error: any) {
      throw new Error(`Failed to gather agent context: ${error.message}`);
    }
  }

  // =========================================================================
  // Session Start Gathering Steps
  // =========================================================================

  async detectStack(): Promise<SessionContext['stack']> {
    // Check cache first (valid for 5 minutes)
    if (this.cache.stack && this.cache.stack_timestamp) {
      const age = Date.now() - new Date(this.cache.stack_timestamp).getTime();
      if (age < 5 * 60 * 1000) {
        return this.cache.stack;
      }
    }

    try {
      // Try using analysis-engine MCP tool first
      const result = await executeMCPTool('plugin_goodvibes_analysis-engine', 'detect_stack', {
        path: this.projectRoot,
        deep: false,
      });

      this.cache.stack = result;
      this.cache.stack_timestamp = new Date().toISOString();
      return result;
    } catch {
      // Fallback to manual detection
      const stack = await detectStackFallback(this.projectRoot);
      this.cache.stack = stack;
      this.cache.stack_timestamp = new Date().toISOString();
      return stack;
    }
  }

  async loadPreferences(): Promise<Record<string, unknown>> {
    const preferences: Record<string, unknown> = {};
    const allPrefs = this.memoryManager.getMemory().preferences;

    // Load project and session preferences
    for (const pref of allPrefs) {
      if (pref.scope === 'project' || pref.scope === 'session') {
        preferences[pref.key] = pref.value;
      }
    }

    return preferences;
  }

  async checkHealth(): Promise<SessionContext['health']> {
    // Check cache first (valid for 2 minutes)
    if (this.cache.health && this.cache.health_timestamp) {
      const age = Date.now() - new Date(this.cache.health_timestamp).getTime();
      if (age < 2 * 60 * 1000) {
        return this.cache.health;
      }
    }

    const session = this.stateManager.getSession();

    // Run quick health checks in parallel
    const [typecheck, lint, test, build] = await Promise.all([
      this.runHealthCheck('npm run typecheck --silent'),
      this.runHealthCheck('npm run lint --silent'),
      this.runHealthCheck('npm run test --silent --run'),
      this.runHealthCheck('npm run build --silent'),
    ]);

    const health = {
      typecheck: typecheck || session.last_typecheck.status,
      lint: lint || session.last_lint.status,
      test: test || session.last_test.status,
      build: build || session.last_build.status,
    };

    // Update state manager with results
    this.stateManager.updateSession({
      last_typecheck: { status: health.typecheck, timestamp: new Date().toISOString() },
      last_lint: { status: health.lint, timestamp: new Date().toISOString() },
      last_test: { status: health.test, timestamp: new Date().toISOString() },
      last_build: { status: health.build, timestamp: new Date().toISOString() },
    });

    this.cache.health = health;
    this.cache.health_timestamp = new Date().toISOString();

    return health;
  }

  async loadGitStatus(): Promise<SessionContext['git']> {
    try {
      const [branch, commit, status, remote] = await Promise.all([
        executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD']),
        executeGitCommand(['rev-parse', '--short', 'HEAD']),
        executeGitCommand(['status', '--porcelain']),
        executeGitCommand(['config', '--get', 'remote.origin.url']),
      ]);

      const git = {
        branch: branch || 'main',
        commit: commit || '',
        dirty: parseGitStatus(status),
        remote: remote || undefined,
      };

      // Update state manager
      this.stateManager.updateSession({
        git: {
          main_branch: 'main', // TODO: Detect main branch
          current_branch: git.branch,
          uncommitted_files: status.split('\n').filter(Boolean).map(line => line.slice(3)),
          last_commit: git.commit,
        },
      });

      return git;
    } catch (error: any) {
      throw new Error(`Failed to load git status: ${error.message}`);
    }
  }

  // =========================================================================
  // Batch Start Gathering Steps
  // =========================================================================

  async analyzeScope(batch_id: string): Promise<{ files: string[]; symbols: string[] }> {
    // TODO: Implement actual scope analysis based on batch operations
    // For now, return empty scope
    return {
      files: [],
      symbols: [],
    };
  }

  async loadRelevantMemory(
    files: string[],
    symbols: string[]
  ): Promise<{ decisions: Decision[]; patterns: Pattern[]; failures: Failure[] }> {
    const memory = this.memoryManager.getMemory();

    // Filter and map decisions relevant to the scope
    const decisions: Decision[] = memory.decisions
      .filter(d =>
        d.status === 'active' &&
        (d.files?.some(f => files.includes(f)) || d.symbols?.some(s => symbols.includes(s)))
      )
      .map(d => ({
        id: d.id,
        what: d.what,
        why: d.why,
        category: d.category,
        confidence: d.confidence === 'high' ? 1.0 : d.confidence === 'medium' ? 0.5 : 0.25,
        files: d.files || [],
        symbols: d.symbols || [],
        status: d.status === 'active' ? 'active' : 'superseded',
        timestamp: d.timestamp,
      }));

    // Filter and map patterns with examples in the scope
    const patterns: Pattern[] = memory.patterns
      .filter(p => p.examples.some(e => files.includes(e.file)))
      .map(p => ({
        id: p.id,
        name: p.name,
        description: p.description,
        examples: p.examples.map(e => `${e.file}:${e.lines[0]}-${e.lines[1]}`),
        when_to_use: p.when_to_use,
        usage_count: p.usage_count,
      }));

    // Filter and map unresolved failures in the scope
    const failures: Failure[] = memory.failures
      .filter(f => !f.resolved && f.files?.some(file => files.includes(file)))
      .map(f => ({
        id: f.id,
        error_type: f.error_type,
        error_message: f.error_message,
        resolution: f.resolution,
        root_cause: f.root_cause,
        prevention: f.prevention,
        timestamp: f.timestamp,
      }));

    return { decisions, patterns, failures };
  }

  async assessRisk(
    files: string[],
    failures: Failure[]
  ): Promise<{ level: 'low' | 'medium' | 'high' | 'critical'; factors: string[] }> {
    const factors: string[] = [];
    let riskScore = 0;

    // Check for unresolved failures in scope
    if (failures.length > 0) {
      factors.push(`${failures.length} unresolved failure(s) in scope`);
      riskScore += failures.length * 10;
    }

    // Check for critical files (e.g., package.json, tsconfig.json)
    const criticalFiles = ['package.json', 'tsconfig.json', '.env', 'next.config.js'];
    const hasCriticalFiles = files.some(f => criticalFiles.some(cf => f.endsWith(cf)));
    if (hasCriticalFiles) {
      factors.push('Modifying critical configuration files');
      riskScore += 20;
    }

    // Check number of files affected
    if (files.length > 10) {
      factors.push(`Large scope: ${files.length} files affected`);
      riskScore += Math.min(files.length, 30);
    }

    // Determine risk level
    let level: 'low' | 'medium' | 'high' | 'critical';
    if (riskScore >= 50) {
      level = 'critical';
    } else if (riskScore >= 30) {
      level = 'high';
    } else if (riskScore >= 15) {
      level = 'medium';
    } else {
      level = 'low';
    }

    return { level, factors };
  }

  async resolveDependencies(batch_id: string): Promise<Map<string, unknown>> {
    // TODO: Implement dependency resolution
    // This would build a graph of operation dependencies
    return new Map();
  }

  // =========================================================================
  // Operation Start Gathering Steps
  // =========================================================================

  async resolveInjections(
    operation_id: string,
    priorResults: Map<string, OperationResult>
  ): Promise<Record<string, unknown>> {
    // TODO: Implement template resolution for operation parameters
    // This would resolve {{operation_id.path}} references
    return {};
  }

  // =========================================================================
  // Agent Spawn Gathering Steps
  // =========================================================================

  async buildAgentPrompt(agent_id: string): Promise<string> {
    // TODO: Implement agent prompt construction
    return '';
  }

  async injectMemory(agent_id: string): Promise<void> {
    // TODO: Implement memory injection into agent context
  }

  async injectPriorResults(agent_id: string): Promise<void> {
    // TODO: Implement prior results injection
  }

  async setBudget(agent_id: string): Promise<void> {
    // TODO: Implement budget setting based on operation complexity
  }

  // =========================================================================
  // Public API - Result Management
  // =========================================================================

  /**
   * Store operation result for later use by other operations
   */
  storeOperationResult(batch_id: string, operation_id: string, result: OperationResult): void {
    if (!this.batchResults.has(batch_id)) {
      this.batchResults.set(batch_id, new Map());
    }
    this.batchResults.get(batch_id)!.set(operation_id, result);
  }

  /**
   * Clear batch results to free memory
   */
  clearBatchResults(batch_id: string): void {
    this.batchResults.delete(batch_id);
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private async runHealthCheck(cmd: string): Promise<'pass' | 'fail' | 'unknown'> {
    try {
      const { exitCode } = await executeCommand(cmd);
      return exitCode === 0 ? 'pass' : 'fail';
    } catch {
      return 'unknown';
    }
  }

  private getDefaultStack(): SessionContext['stack'] {
    return {
      languages: ['javascript'],
      frameworks: [],
      libraries: [],
      tools: [],
    };
  }

  private getDefaultGit(): SessionContext['git'] {
    return {
      branch: 'main',
      commit: '',
      dirty: false,
    };
  }

  private getDefaultHealth(): SessionContext['health'] {
    return {
      typecheck: 'unknown',
      lint: 'unknown',
      test: 'unknown',
      build: 'unknown',
    };
  }
}

/**
 * Create a new ContextGatherer instance
 */
export function createContextGatherer(
  projectRoot?: string,
  stateManager?: StateManager,
  memoryManager?: MemoryManager
): ContextGatherer {
  return new ContextGathererImpl(projectRoot, stateManager, memoryManager);
}

/**
 * Singleton context gatherer instance
 */
let globalContextGatherer: ContextGatherer | null = null;

/**
 * Get the global ContextGatherer instance
 */
export function getContextGatherer(
  projectRoot?: string,
  stateManager?: StateManager,
  memoryManager?: MemoryManager
): ContextGatherer {
  if (!globalContextGatherer) {
    globalContextGatherer = createContextGatherer(projectRoot, stateManager, memoryManager);
  }
  return globalContextGatherer;
}

/**
 * Reset the global ContextGatherer (useful for testing)
 */
export function resetGlobalContextGatherer(): void {
  globalContextGatherer = null;
}
