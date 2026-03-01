/**
 * Find Dead Code Extension
 *
 * L2 orchestration function that composes L1 code-intel utilities
 * to find unused exports in a file or directory.
 *
 * @module extensions/code-intel/dead-code
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { getProjectRoot } from '../../shared/config.js';
import { ok, fail, failFromException } from '../../shared/response.js';
import type { McpResponse } from '../../shared/types.js';
import { normalizePath, toRelativePath } from '../../shared/utils.js';
import {
  findSourceFiles,
  isTestFile,
  languageServiceManager,
  findExportsInFile,
  countReferences,
} from '../../core/code-intel/index.js';
import type { FindDeadCodeArgs, DeadExport, LanguageServiceResult } from '../../core/code-intel/types.js';

/**
 * Find unused exports in a file or directory.
 *
 * Orchestrates: resolve path → find source files → findExportsInFile
 * → countReferences per export → collect dead exports → ok()
 *
 * @param args - The find_dead_code tool arguments
 * @returns MCP tool response with JSON-formatted dead exports
 *
 * @example
 * ```typescript
 * const result = await findDeadCode({ path: 'src/utils.ts', include_tests: true });
 * // Returns dead exports with file, name, kind, line
 * ```
 */
export async function findDeadCode(args: FindDeadCodeArgs): Promise<McpResponse> {
  try {
    const targetPath = args.path ?? '.';
    const includeTests = args.include_tests ?? true;
    const projectRoot = getProjectRoot();

    const absolutePath = path.isAbsolute(targetPath)
      ? targetPath
      : path.resolve(projectRoot, targetPath);

    if (!absolutePath.startsWith(projectRoot)) {
      return fail('Path escapes project root');
    }

    let filesToAnalyze: string[];
    try {
      const stat = await fs.stat(absolutePath);
      if (stat.isFile()) {
        filesToAnalyze = [absolutePath];
      } else if (stat.isDirectory()) {
        filesToAnalyze = await findSourceFiles(absolutePath);
      } else {
        return fail(`Path is not a file or directory: ${targetPath}`);
      }
    } catch {
      return fail(`Path not found: ${targetPath}`);
    }

    if (filesToAnalyze.length === 0) {
      return ok({ dead_exports: [], count: 0, files_analyzed: 0 });
    }

    // Skip test files from analysis
    const sourceFilesToAnalyze = filesToAnalyze.filter((f) => !isTestFile(f));

    const deadExports: DeadExport[] = [];

    // Group files by their tsconfig to batch-process files sharing the same language service
    const serviceGroups = new Map<string, { service: LanguageServiceResult; files: string[] }>();

    for (const filePath of sourceFilesToAnalyze) {
      const normalizedPath = normalizePath(filePath);
      const { service, program, configPath } = await languageServiceManager.getServiceForFile(normalizedPath);
      const groupKey = configPath ?? 'no-tsconfig';

      if (!serviceGroups.has(groupKey)) {
        serviceGroups.set(groupKey, { service: { service, program, configPath }, files: [] });
      }
      serviceGroups.get(groupKey)!.files.push(normalizedPath);
    }

    for (const { service: { service, program }, files } of serviceGroups.values()) {
      for (const normalizedPath of files) {
        const sourceFile = program.getSourceFile(normalizedPath);
        if (!sourceFile) continue;

        const exports = findExportsInFile(sourceFile, service);

        for (const exp of exports) {
          if (exp.name === 'default') continue;

          const position = sourceFile.getPositionOfLineAndCharacter(
            exp.line - 1,
            exp.column - 1
          );

          const { external } = countReferences(service, normalizedPath, position, includeTests);

          if (external === 0) {
            deadExports.push({
              file: toRelativePath(exp.file, projectRoot),
              name: exp.name,
              kind: exp.kind,
              line: exp.line,
              exported_from: exp.exportedFrom,
            });
          }
        }
      }
    }

    deadExports.sort((a, b) => {
      const fileCompare = a.file.localeCompare(b.file);
      if (fileCompare !== 0) return fileCompare;
      return a.line - b.line;
    });

    return ok({
      dead_exports: deadExports,
      count: deadExports.length,
      files_analyzed: sourceFilesToAnalyze.length,
    });
  } catch (error) {
    return failFromException(error, 'Failed to find dead code');
  }
}
