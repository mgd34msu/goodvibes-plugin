/**
 * Semantic Diff Handler
 *
 * LLM-powered type-aware diff with semantic impact explanation.
 * Goes beyond text-based diff to understand what semantically changed,
 * impact on type safety, and which callers might be affected.
 *
 * @module handlers/lsp/semantic-diff
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';

import { PROJECT_ROOT } from '../../config.js';
import { languageServiceManager } from './language-service.js';
import {
  createSuccessResponse,
  createErrorResponse,
  makeRelativePath,
  type ToolResponse,
} from './utils.js';

// =============================================================================
// Types
// =============================================================================

export interface SemanticDiffArgs {
  /** Git ref to compare from (e.g., HEAD~1, commit hash, branch name) */
  before_ref: string;
  /** Git ref to compare to (default "HEAD") */
  after_ref?: string;
  /** Optional specific file to analyze */
  file?: string;
}

interface SemanticChange {
  /** File path */
  file: string;
  /** Human-readable summary of what changed semantically */
  summary: string;
  /** Detailed explanation of the semantic impact */
  semantic_impact: string;
  /** List of files/functions that call or depend on changed code */
  affected_callers: string[];
  /** Risk level of this change */
  risk_level: 'low' | 'medium' | 'high';
}

interface SemanticDiffResult {
  /** List of semantic changes with impact analysis */
  changes: SemanticChange[];
  /** High-level summary of all changes and their combined impact */
  overall_summary: string;
}

interface ChangedFileInfo {
  file: string;
  status: 'M' | 'A' | 'D' | 'R';
  diff: string;
  beforeContent: string | null;
  afterContent: string | null;
}

interface SymbolWithReferences {
  name: string;
  kind: string;
  signature: string;
  line: number;
  references: string[];
}

// =============================================================================
// Git Helpers
// =============================================================================

/**
 * Get diff and content for changed files between two refs.
 */
function getChangedFilesWithContent(
  beforeRef: string,
  afterRef: string,
  fileFilter?: string
): ChangedFileInfo[] {
  try {
    // Get list of changed files
    const cmd = fileFilter
      ? `git diff --name-status ${beforeRef}..${afterRef} -- "${fileFilter}"`
      : `git diff --name-status ${beforeRef}..${afterRef}`;

    const filesOutput = execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });

    const changedFiles: ChangedFileInfo[] = [];
    const lines = filesOutput.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t');

      // Only process TypeScript and JavaScript files
      if (!file.match(/\.(ts|tsx|js|jsx|mts|cts)$/)) continue;
      // Skip type declaration files
      if (file.endsWith('.d.ts')) continue;

      // Get diff
      let diff = '';
      try {
        diff = execSync(`git diff ${beforeRef}..${afterRef} -- "${file}"`, {
          cwd: PROJECT_ROOT,
          encoding: 'utf-8',
          maxBuffer: 10 * 1024 * 1024,
        });
      } catch {
        // File might not exist in one of the refs
      }

      // Get before content
      let beforeContent: string | null = null;
      if (status !== 'A') {
        try {
          beforeContent = execSync(`git show ${beforeRef}:"${file}"`, {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
        } catch {
          // File doesn't exist in before ref
        }
      }

      // Get after content
      let afterContent: string | null = null;
      if (status !== 'D') {
        try {
          afterContent = execSync(`git show ${afterRef}:"${file}"`, {
            cwd: PROJECT_ROOT,
            encoding: 'utf-8',
            maxBuffer: 10 * 1024 * 1024,
          });
        } catch {
          // File doesn't exist in after ref
        }
      }

      changedFiles.push({
        file,
        status: status as 'M' | 'A' | 'D' | 'R',
        diff,
        beforeContent,
        afterContent,
      });
    }

    return changedFiles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get changed files: ${message}`);
  }
}

// =============================================================================
// Reference Finding
// =============================================================================

/**
 * Find files that reference symbols from a given file.
 */
async function findReferencingFiles(filePath: string): Promise<string[]> {
  const referencingFiles = new Set<string>();

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(PROJECT_ROOT, filePath);

    if (!fs.existsSync(absolutePath)) {
      return [];
    }

    const { service, program } = await languageServiceManager.getServiceForFile(absolutePath);
    const sourceFile = program.getSourceFile(absolutePath.replace(/\\/g, '/'));

    if (!sourceFile) {
      return [];
    }

    // Get navigation tree to find exported symbols
    const navTree = service.getNavigationTree(absolutePath.replace(/\\/g, '/'));

    if (navTree && navTree.childItems) {
      for (const item of navTree.childItems) {
        if (item.text.startsWith('<') || item.text.startsWith('_')) continue;

        const spans = item.spans;
        if (!spans || spans.length === 0) continue;

        const pos = spans[0].start;

        // Find references to this symbol
        try {
          const references = service.findReferences(absolutePath.replace(/\\/g, '/'), pos);

          if (references) {
            for (const refGroup of references) {
              for (const ref of refGroup.references) {
                const refFile = ref.fileName;
                // Skip the source file itself and node_modules
                if (refFile !== absolutePath.replace(/\\/g, '/') && !refFile.includes('node_modules')) {
                  referencingFiles.add(makeRelativePath(refFile, PROJECT_ROOT));
                }
              }
            }
          }
        } catch {
          // Ignore reference finding errors for individual symbols
        }
      }
    }
  } catch (error) {
    console.warn(`Failed to find references for ${filePath}:`, error);
  }

  return Array.from(referencingFiles);
}

/**
 * Extract exported symbol signatures from file content.
 */
function extractExportedSymbols(content: string, fileName: string): SymbolWithReferences[] {
  const symbols: SymbolWithReferences[] = [];

  try {
    const sourceFile = ts.createSourceFile(
      fileName,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX
    );

    function visit(node: ts.Node) {
      // Check for export modifiers
      const modifiers = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
      const isExported = modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);

      if (isExported) {
        let name = '';
        let kind = '';
        let signature = '';

        if (ts.isFunctionDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'function';
          signature = node.getText(sourceFile).split('{')[0].trim();
        } else if (ts.isClassDeclaration(node) && node.name) {
          name = node.name.text;
          kind = 'class';
          // Get class signature without body
          const classKeyword = node.getText(sourceFile);
          const braceIndex = classKeyword.indexOf('{');
          signature = braceIndex > 0 ? classKeyword.slice(0, braceIndex).trim() : classKeyword;
        } else if (ts.isInterfaceDeclaration(node)) {
          name = node.name.text;
          kind = 'interface';
          signature = node.getText(sourceFile);
        } else if (ts.isTypeAliasDeclaration(node)) {
          name = node.name.text;
          kind = 'type';
          signature = node.getText(sourceFile);
        } else if (ts.isVariableStatement(node)) {
          const declarations = node.declarationList.declarations;
          for (const decl of declarations) {
            if (ts.isIdentifier(decl.name)) {
              name = decl.name.text;
              kind = ts.isVariableDeclarationList(node.declarationList) &&
                node.declarationList.flags & ts.NodeFlags.Const ? 'const' : 'variable';
              signature = decl.getText(sourceFile);

              const { line } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
              symbols.push({
                name,
                kind,
                signature: signature.length > 200 ? signature.slice(0, 200) + '...' : signature,
                line: line + 1,
                references: [],
              });
            }
          }
          return; // Already added symbols
        } else if (ts.isEnumDeclaration(node)) {
          name = node.name.text;
          kind = 'enum';
          signature = node.getText(sourceFile);
        }

        if (name) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          symbols.push({
            name,
            kind,
            signature: signature.length > 200 ? signature.slice(0, 200) + '...' : signature,
            line: line + 1,
            references: [],
          });
        }
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  } catch (error) {
    console.warn(`Failed to extract symbols from ${fileName}:`, error);
  }

  return symbols;
}

// =============================================================================
// LLM Analysis
// =============================================================================

/**
 * Spawn Claude CLI to analyze semantic changes.
 */
async function analyzeWithLLM(
  changedFiles: ChangedFileInfo[],
  fileReferences: Map<string, string[]>
): Promise<SemanticDiffResult> {
  // Build context for LLM
  const context: string[] = [];

  for (const { file, status, diff, beforeContent, afterContent } of changedFiles) {
    context.push(`\n## File: ${file} (${status === 'D' ? 'DELETED' : status === 'A' ? 'ADDED' : 'MODIFIED'})\n`);

    // Add before symbols if available
    if (beforeContent) {
      const beforeSymbols = extractExportedSymbols(beforeContent, file);
      if (beforeSymbols.length > 0) {
        context.push('### Before (exported symbols):');
        for (const sym of beforeSymbols.slice(0, 20)) {
          context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
        }
        if (beforeSymbols.length > 20) {
          context.push(`... and ${beforeSymbols.length - 20} more symbols`);
        }
      }
    }

    // Add after symbols if available
    if (afterContent) {
      const afterSymbols = extractExportedSymbols(afterContent, file);
      if (afterSymbols.length > 0) {
        context.push('\n### After (exported symbols):');
        for (const sym of afterSymbols.slice(0, 20)) {
          context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
        }
        if (afterSymbols.length > 20) {
          context.push(`... and ${afterSymbols.length - 20} more symbols`);
        }
      }
    }

    // Add references
    const refs = fileReferences.get(file);
    if (refs && refs.length > 0) {
      context.push('\n### Files that reference this file:');
      for (const ref of refs.slice(0, 10)) {
        context.push(`- ${ref}`);
      }
      if (refs.length > 10) {
        context.push(`... and ${refs.length - 10} more files`);
      }
    }

    // Add diff
    if (diff) {
      context.push('\n### Diff:');
      context.push('```diff');
      const diffLines = diff.split('\n').slice(0, 80);
      context.push(diffLines.join('\n'));
      if (diff.split('\n').length > 80) {
        context.push('... (diff truncated)');
      }
      context.push('```');
    }
  }

  const prompt = `You are analyzing TypeScript/JavaScript code changes to provide semantic understanding.

Your job is to go beyond line-by-line diff and explain:
1. What SEMANTICALLY changed (the meaning/behavior, not just syntax)
2. How these changes affect type safety and API contracts
3. Which callers/consumers might be affected
4. The risk level of each change

Here are the changes to analyze:
${context.join('\n')}

Analyze these changes and respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "changes": [
    {
      "file": "path/to/file.ts",
      "summary": "Brief human-readable summary of what changed semantically",
      "semantic_impact": "Detailed explanation of the semantic impact, type safety implications, and behavioral changes",
      "affected_callers": ["path/to/caller1.ts", "path/to/caller2.ts"],
      "risk_level": "low|medium|high"
    }
  ],
  "overall_summary": "High-level summary of all changes and their combined impact"
}

Risk level guidelines:
- "low": Internal refactoring, documentation, adding new optional functionality
- "medium": Changes to shared utilities, output format changes, behavioral changes that might affect some callers
- "high": Breaking API changes, security-related changes, changes that affect many callers

Focus on what matters to developers consuming this code. Be specific about behavioral changes, not just structural ones.`;

  return new Promise((resolve, reject) => {
    const claudeProcess = spawn('claude', ['--print', '-p', prompt], {
      cwd: PROJECT_ROOT,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    claudeProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    claudeProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    claudeProcess.on('close', (code) => {
      if (code !== 0) {
        console.warn(`Claude CLI exited with code ${code}: ${stderr}`);
        // Provide fallback analysis
        resolve({
          changes: changedFiles.map(f => ({
            file: f.file,
            summary: `File ${f.status === 'A' ? 'added' : f.status === 'D' ? 'deleted' : 'modified'}`,
            semantic_impact: 'LLM analysis unavailable. Please review the diff manually.',
            affected_callers: fileReferences.get(f.file) ?? [],
            risk_level: 'medium' as const,
          })),
          overall_summary: `${changedFiles.length} file(s) changed. LLM analysis unavailable.`,
        });
        return;
      }

      try {
        // Extract JSON from the response
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const result = JSON.parse(jsonMatch[0]) as SemanticDiffResult;
        resolve(result);
      } catch (parseError) {
        console.warn('Failed to parse LLM response:', parseError);
        console.warn('Raw response:', stdout);
        resolve({
          changes: [],
          overall_summary: 'Failed to analyze changes. Please review manually.',
        });
      }
    });

    claudeProcess.on('error', (error) => {
      console.warn('Failed to spawn Claude CLI:', error);
      resolve({
        changes: [],
        overall_summary: 'Claude CLI not available. Please install Claude CLI to use this feature.',
      });
    });

    // Set timeout
    setTimeout(() => {
      claudeProcess.kill();
      reject(new Error('LLM analysis timed out after 60 seconds'));
    }, 60000);
  });
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handles the semantic_diff MCP tool call.
 *
 * Provides type-aware diff with semantic impact explanation using LLM analysis.
 *
 * @param args - The semantic_diff tool arguments
 * @returns MCP tool response with semantic diff analysis
 *
 * @example
 * // Analyze semantic diff since last commit
 * await handleSemanticDiff({
 *   before_ref: 'HEAD~1'
 * });
 */
export async function handleSemanticDiff(
  args: SemanticDiffArgs
): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.before_ref) {
    return createErrorResponse('Missing required argument: before_ref');
  }

  const beforeRef = args.before_ref;
  const afterRef = args.after_ref ?? 'HEAD';
  const fileFilter = args.file;

  try {
    // Verify git is available and refs exist
    try {
      execSync(`git rev-parse ${beforeRef}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
      execSync(`git rev-parse ${afterRef}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    } catch {
      return createErrorResponse(`Invalid git refs: ${beforeRef} or ${afterRef}`);
    }

    // Get changed files with content
    const changedFiles = getChangedFilesWithContent(beforeRef, afterRef, fileFilter);

    if (changedFiles.length === 0) {
      return createSuccessResponse({
        changes: [],
        overall_summary: 'No TypeScript/JavaScript files changed between refs',
      });
    }

    // Find references for each changed file
    const fileReferences = new Map<string, string[]>();

    for (const { file, afterContent } of changedFiles) {
      if (afterContent) {
        // Write to temp file to use language service
        const tempDir = path.join(PROJECT_ROOT, '.goodvibes-temp');
        const tempFile = path.join(tempDir, path.basename(file));

        try {
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          fs.writeFileSync(tempFile, afterContent, 'utf-8');

          const refs = await findReferencingFiles(tempFile);
          fileReferences.set(file, refs);

          // Clean up
          fs.unlinkSync(tempFile);
        } catch {
          // Ignore temp file errors
        }
      }
    }

    // Clean up temp directory
    try {
      const tempDir = path.join(PROJECT_ROOT, '.goodvibes-temp');
      if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
        fs.rmdirSync(tempDir);
      }
    } catch {
      // Ignore cleanup errors
    }

    // Analyze with LLM
    const result = await analyzeWithLLM(changedFiles, fileReferences);

    // Ensure file paths are relative
    result.changes = result.changes.map(change => ({
      ...change,
      file: change.file.startsWith('/')
        ? makeRelativePath(change.file, PROJECT_ROOT)
        : change.file,
      affected_callers: change.affected_callers.map(caller =>
        caller.startsWith('/') ? makeRelativePath(caller, PROJECT_ROOT) : caller
      ),
    }));

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to analyze semantic diff: ${message}`);
  }
}
