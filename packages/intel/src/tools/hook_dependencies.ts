/**
 * `hook_dependencies`, audit React hook dependency arrays.
 *
 * Straight port (§4.1, §3 KEEP) of frontend-engine `extensions/hook-dependencies.ts`
 * + `core/hooks/*` onto the shared compiler host and `core/envelope`. v2 wrappers:
 *  - `base_path` contract (issue 1): the file resolves via `core/fsx`; the result
 *    echoes an absolute `resolved_path`.
 *  - `core/proc` budget: analysis runs under `withBudget`.
 *  - `core/envelope`: honest token accounting; `output.max_tokens` trims issues
 *    then hooks with `truncated` + `effective_caps`.
 *  - SourceFile comes from the ONE compiler host (§3.3), not `ts.createSourceFile`.
 *
 * @module tools/hook_dependencies
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import ts from 'typescript';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from './types.js';
import {
  successEnvelope,
  errorEnvelope,
  toCallToolResult,
  renderEnvelope,
  estimatePayloadTokens,
  startTimer,
  type Envelope,
} from '@goodvibes/core/envelope';
import { resolveBaseDir, resolveInputPath } from '@goodvibes/core/fsx';
import { loadConfig } from '@goodvibes/core/config';
import { withBudget } from '@goodvibes/core/proc';

import { makeRelativePath } from '../host/index.js';
import { getSourceFile, FRONTEND_EXTENSIONS } from '../frontend/source.js';
import { buildComponentScope, extractHooksWithDeps } from '../frontend/hooks/extractor.js';
import { analyzeDependencies } from '../frontend/hooks/stability-analyzer.js';
import { detectAllIssues } from '../frontend/hooks/issue-detector.js';
import type { HookInfo, HookIssue } from '../frontend/hooks/types.js';

interface HookDependenciesArgs {
  base_path?: string;
  file?: string;
  hook?: string;
  include_stable_analysis?: boolean;
  output?: { max_tokens?: number };
}

/** A hook serialized for output, the internal `body`/`bodyRefs` are dropped. */
interface SerializedHook {
  name: string;
  line: number;
  variableName?: string;
  deps: HookInfo['deps'];
  rawDeps: string[];
  hasEmptyDeps: boolean;
  hasNoDeps: boolean;
  hasCleanup: boolean;
  hasSubscriptions: boolean;
}

interface HookDependenciesData {
  file: string;
  resolved_path: string;
  component: string;
  hooks: SerializedHook[];
  issues: HookIssue[];
  summary: {
    total_hooks: number;
    total_issues: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
  };
}

const definition: Tool = {
  name: 'hook_dependencies',
  description:
    'Use to find missing or stale React hook dependencies without eyeballing every array. Audit a React component file\'s hook dependency arrays (useEffect, useMemo, ' +
    'useCallback, useLayoutEffect, useInsertionEffect) for stale closures, missing/' +
    'unnecessary dependencies, unstable references, effect-as-derived-state, and ' +
    'missing cleanup. Static TypeScript AST analysis; no code is executed.',
  inputSchema: {
    type: 'object',
    properties: {
      base_path: {
        type: 'string',
        description: 'Absolute project root. Relative paths resolve against it.',
      },
      file: {
        type: 'string',
        description: 'Component file to analyze (relative to base_path or absolute).',
      },
      hook: {
        type: 'string',
        description: 'Focus on one hook by its assigned variable name or 1-based line number.',
      },
      include_stable_analysis: {
        type: 'boolean',
        description: 'Include stability classification for all deps (default true).',
      },
      output: {
        type: 'object',
        properties: {
          max_tokens: {
            type: 'number',
            description: 'Cap the rendered response; issues then hooks trim to fit.',
          },
        },
      },
    },
    required: ['file'],
  },
};

/** Detect the first PascalCase component name, else the filename stem. */
function detectComponentName(sourceFile: ts.SourceFile, filePath: string): string {
  for (const statement of sourceFile.statements) {
    if (
      ts.isFunctionDeclaration(statement) &&
      statement.name &&
      /^[A-Z]/.test(statement.name.getText(sourceFile))
    ) {
      return statement.name.getText(sourceFile);
    }
    if (ts.isVariableStatement(statement)) {
      for (const decl of statement.declarationList.declarations) {
        if (
          ts.isIdentifier(decl.name) &&
          /^[A-Z]/.test(decl.name.getText(sourceFile)) &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          return decl.name.getText(sourceFile);
        }
      }
    }
  }
  return path.basename(filePath, path.extname(filePath));
}

/** Filter hooks by a variable name or a line number string. */
function filterHooks(hooks: HookInfo[], hookFilter: string): HookInfo[] {
  const lineNum = parseInt(hookFilter, 10);
  if (!isNaN(lineNum)) {return hooks.filter((h) => h.line === lineNum);}
  return hooks.filter((h) => h.variableName === hookFilter || h.name === hookFilter);
}

/** Trim issues then hooks until the rendered envelope fits `maxTokens`. */
function capToTokens(
  env: Envelope<HookDependenciesData>,
  maxTokens?: number,
): Envelope<HookDependenciesData> {
  if (!maxTokens || maxTokens <= 0 || !env.data) {return env;}
  if (estimatePayloadTokens(renderEnvelope(env)) <= maxTokens) {return env;}

  const data = env.data;
  const trim = (): Envelope<HookDependenciesData> => ({
    ...env,
    data,
    meta: {
      ...env.meta,
      truncated: true,
      effective_caps: { ...(env.meta.effective_caps ?? {}), max_tokens: maxTokens },
    },
  });

  while (data.issues.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.issues.pop();
  }
  while (data.hooks.length > 0 && estimatePayloadTokens(renderEnvelope(trim())) > maxTokens) {
    data.hooks.pop();
  }
  return trim();
}

/** The `hook_dependencies` handler. */
export async function handler(rawArgs: unknown): Promise<CallToolResult> {
  const elapsed = startTimer();
  const args = (rawArgs ?? {}) as HookDependenciesArgs;
  const cfg = loadConfig();

  if (typeof args.file !== 'string' || args.file.length === 0) {
    return toCallToolResult(errorEnvelope('Missing required argument: file'));
  }

  const baseDir = resolveBaseDir(args.base_path);
  const resolved = resolveInputPath(args.file, args.base_path);
  const absFile = resolved.resolved_path;

  const ext = path.extname(absFile).toLowerCase();
  if (!(FRONTEND_EXTENSIONS as readonly string[]).includes(ext)) {
    return toCallToolResult(
      errorEnvelope(`Unsupported file type: ${ext || '(none)'}. Supported: ${FRONTEND_EXTENSIONS.join(', ')}.`),
    );
  }

  try {
    const stat = await fs.stat(absFile).catch(() => null);
    if (!stat || !stat.isFile()) {
      return toCallToolResult(errorEnvelope(`File not found: ${absFile}`));
    }

    const outcome = await withBudget(cfg.budgets.analyzer_ms, async (signal) => {
      const sourceFile = getSourceFile(absFile);
      if (!sourceFile) {
        return { failed: true as const };
      }

      const componentName = detectComponentName(sourceFile, absFile);
      const scope = buildComponentScope(sourceFile, sourceFile);
      let hooks = extractHooksWithDeps(sourceFile, sourceFile, scope);
      if (args.hook) {hooks = filterHooks(hooks, args.hook);}

      const includeStable = args.include_stable_analysis !== false;
      for (const hook of hooks) {
        if (signal.aborted) {break;}
        const analyzedDeps = analyzeDependencies(hook.rawDeps, scope, sourceFile);
        hook.deps = includeStable ? analyzedDeps : analyzedDeps.filter((d) => d.stability !== 'stable');
      }

      const allIssues: HookIssue[] = [];
      for (const hook of hooks) {
        if (signal.aborted) {break;}
        allIssues.push(...detectAllIssues(hook, scope));
      }

      const bySeverity: Record<string, number> = {};
      const byType: Record<string, number> = {};
      for (const issue of allIssues) {
        bySeverity[issue.severity] = (bySeverity[issue.severity] ?? 0) + 1;
        byType[issue.type] = (byType[issue.type] ?? 0) + 1;
      }

      const serialized: SerializedHook[] = hooks.map((h) => ({
        name: h.name,
        line: h.line,
        variableName: h.variableName,
        deps: h.deps,
        rawDeps: h.rawDeps,
        hasEmptyDeps: h.hasEmptyDeps,
        hasNoDeps: h.hasNoDeps,
        hasCleanup: h.hasCleanup,
        hasSubscriptions: h.hasSubscriptions,
      }));

      const data: HookDependenciesData = {
        file: makeRelativePath(absFile, baseDir),
        resolved_path: absFile,
        component: componentName,
        hooks: serialized,
        issues: allIssues,
        summary: {
          total_hooks: serialized.length,
          total_issues: allIssues.length,
          by_severity: bySeverity,
          by_type: byType,
        },
      };
      return { failed: false as const, data };
    });

    if (outcome.value.failed) {
      return toCallToolResult(errorEnvelope(`Failed to parse component file: ${absFile}`));
    }

    let env = successEnvelope<HookDependenciesData>(outcome.value.data, {
      execution_ms: elapsed(),
      ...(outcome.budget_exceeded ? { budget_exceeded: true } : {}),
    });
    if (resolved.warning) {env = { ...env, warning: resolved.warning };}

    const maxTokens = args.output?.max_tokens ?? cfg.max_tokens_default;
    env = capToTokens(env, maxTokens);
    return toCallToolResult(env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return toCallToolResult(errorEnvelope(`Hook dependency analysis failed: ${message}`));
  }
}

/** Registration entry consumed by `src/index.ts`. */
export const hookDependenciesTool: ToolDefinition = { definition, handler };
