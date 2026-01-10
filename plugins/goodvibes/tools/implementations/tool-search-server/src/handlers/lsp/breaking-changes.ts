/**
 * Detect Breaking Changes Handler
 *
 * LLM-powered tool to detect breaking API changes between git refs.
 * Compares type signatures before/after a change and uses Claude to
 * analyze which changes break API compatibility.
 *
 * @module handlers/lsp/breaking-changes
 */

import { execSync, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

export interface DetectBreakingChangesArgs {
  /** Git ref to compare from (e.g., HEAD~1, commit hash, branch name) */
  before_ref: string;
  /** Git ref to compare to (default "HEAD") */
  after_ref?: string;
  /** Optional path filter to limit analysis to specific files/directories */
  path?: string;
}

interface BreakingChange {
  /** File path where the breaking change occurred */
  file: string;
  /** Name of the changed symbol */
  symbol: string;
  /** Type of breaking change */
  change_type: string;
  /** Previous signature or definition */
  before: string;
  /** New signature or definition */
  after: string;
  /** Description of the impact on consumers */
  impact: string;
  /** Suggested migration steps */
  migration: string;
}

interface NonBreakingChange {
  /** File path */
  file: string;
  /** Name of the changed symbol */
  symbol: string;
  /** Type of change */
  change_type: string;
  /** Description of the change */
  description: string;
}

interface DetectBreakingChangesResult {
  /** List of detected breaking changes */
  breaking_changes: BreakingChange[];
  /** List of non-breaking changes detected */
  non_breaking_changes: NonBreakingChange[];
  /** Overall severity */
  severity: 'none' | 'minor' | 'major';
}

interface ChangedFile {
  file: string;
  status: 'M' | 'A' | 'D' | 'R';
  diff: string;
}

interface FileTypeInfo {
  file: string;
  symbols: SymbolInfo[];
}

interface SymbolInfo {
  name: string;
  kind: string;
  signature: string;
  line: number;
  exported: boolean;
}

// =============================================================================
// Git Helpers
// =============================================================================

/**
 * Get list of changed TypeScript/JavaScript files between two refs.
 */
function getChangedFiles(
  beforeRef: string,
  afterRef: string,
  pathFilter?: string
): ChangedFile[] {
  try {
    const pathArg = pathFilter ? `-- ${pathFilter}` : '';

    // Get list of changed files
    const filesOutput = execSync(
      `git diff --name-status ${beforeRef}..${afterRef} ${pathArg}`,
      { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );

    const changedFiles: ChangedFile[] = [];
    const lines = filesOutput.trim().split('\n').filter(Boolean);

    for (const line of lines) {
      const [status, ...fileParts] = line.split('\t');
      const file = fileParts.join('\t'); // Handle renamed files

      // Only process TypeScript and JavaScript files
      if (!file.match(/\.(ts|tsx|js|jsx|mts|cts)$/)) continue;
      // Skip test files and type declaration files
      if (file.includes('.test.') || file.includes('.spec.') || file.endsWith('.d.ts')) continue;

      // Get the diff for this file
      let diff = '';
      try {
        diff = execSync(
          `git diff ${beforeRef}..${afterRef} -- "${file}"`,
          { cwd: PROJECT_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
        );
      } catch {
        // File might not exist in one of the refs
      }

      changedFiles.push({
        file,
        status: status as 'M' | 'A' | 'D' | 'R',
        diff,
      });
    }

    return changedFiles;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to get changed files: ${message}`);
  }
}

/**
 * Get file content at a specific git ref.
 */
function getFileAtRef(file: string, ref: string): string | null {
  try {
    return execSync(`git show ${ref}:"${file}"`, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch {
    return null;
  }
}

// =============================================================================
// Type Extraction Helpers
// =============================================================================

/**
 * Extract exported symbols and their type signatures from a file.
 */
async function extractTypeInfo(filePath: string): Promise<FileTypeInfo> {
  const symbols: SymbolInfo[] = [];

  try {
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(PROJECT_ROOT, filePath);

    if (!fs.existsSync(absolutePath)) {
      return { file: filePath, symbols };
    }

    const { service, program } = await languageServiceManager.getServiceForFile(absolutePath);
    const sourceFile = program.getSourceFile(absolutePath.replace(/\\/g, '/'));

    if (!sourceFile) {
      return { file: filePath, symbols };
    }

    // Get document symbols (navigation tree)
    const navTree = service.getNavigationTree(absolutePath.replace(/\\/g, '/'));

    if (navTree && navTree.childItems) {
      for (const item of navTree.childItems) {
        // Skip anonymous functions and internal symbols
        if (item.text.startsWith('<') || item.text.startsWith('_')) continue;

        const spans = item.spans;
        if (!spans || spans.length === 0) continue;

        const pos = spans[0].start;
        const { line } = sourceFile.getLineAndCharacterOfPosition(pos);

        // Get quick info for the symbol
        const quickInfo = service.getQuickInfoAtPosition(absolutePath.replace(/\\/g, '/'), pos);
        let signature = '';

        if (quickInfo && quickInfo.displayParts) {
          signature = quickInfo.displayParts.map(p => p.text).join('');
        }

        // Check if exported by looking at the signature
        const isExported = signature.includes('export ') ||
          item.kindModifiers?.includes('export') ||
          false;

        symbols.push({
          name: item.text,
          kind: item.kind,
          signature,
          line: line + 1,
          exported: isExported,
        });
      }
    }
  } catch (error) {
    // Silently handle errors for individual files
    console.warn(`Failed to extract type info from ${filePath}:`, error);
  }

  return { file: filePath, symbols };
}

/**
 * Create a temporary file with content and extract type info.
 */
async function extractTypeInfoFromContent(
  originalPath: string,
  content: string
): Promise<FileTypeInfo> {
  const tempDir = path.join(PROJECT_ROOT, '.goodvibes-temp');
  const tempFile = path.join(tempDir, path.basename(originalPath));

  try {
    // Create temp directory if needed
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Write content to temp file
    fs.writeFileSync(tempFile, content, 'utf-8');

    // Extract type info
    const result = await extractTypeInfo(tempFile);
    result.file = originalPath; // Use original path in result

    return result;
  } finally {
    // Clean up
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      if (fs.existsSync(tempDir) && fs.readdirSync(tempDir).length === 0) {
        fs.rmdirSync(tempDir);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// =============================================================================
// LLM Analysis
// =============================================================================

/**
 * Spawn Claude CLI to analyze changes.
 */
async function analyzeWithLLM(
  changedFiles: ChangedFile[],
  beforeTypes: Map<string, FileTypeInfo>,
  afterTypes: Map<string, FileTypeInfo>
): Promise<DetectBreakingChangesResult> {
  // Build context for LLM
  const context: string[] = [];

  for (const { file, status, diff } of changedFiles) {
    const beforeInfo = beforeTypes.get(file);
    const afterInfo = afterTypes.get(file);

    context.push(`\n## File: ${file} (${status === 'D' ? 'DELETED' : status === 'A' ? 'ADDED' : 'MODIFIED'})\n`);

    if (beforeInfo && beforeInfo.symbols.length > 0) {
      context.push('### Before (exported symbols):');
      for (const sym of beforeInfo.symbols.filter(s => s.exported)) {
        context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
      }
    }

    if (afterInfo && afterInfo.symbols.length > 0) {
      context.push('\n### After (exported symbols):');
      for (const sym of afterInfo.symbols.filter(s => s.exported)) {
        context.push(`- ${sym.name} (${sym.kind}): ${sym.signature}`);
      }
    }

    if (diff) {
      context.push('\n### Diff:');
      context.push('```diff');
      // Limit diff size
      const diffLines = diff.split('\n').slice(0, 100);
      context.push(diffLines.join('\n'));
      if (diff.split('\n').length > 100) {
        context.push('... (diff truncated)');
      }
      context.push('```');
    }
  }

  const prompt = `You are analyzing TypeScript/JavaScript code changes to detect breaking API changes.

A breaking change is any change that could cause existing consumers of the API to fail, including:
- Removing exported functions, classes, interfaces, types, or constants
- Changing function signatures (parameter types, return types, required parameters)
- Changing interface/type property types or making optional properties required
- Renaming exported symbols without providing aliases
- Changing class method visibility or signatures

A non-breaking change is additive or internal:
- Adding new optional parameters with defaults
- Adding new exported symbols
- Adding new optional properties to interfaces
- Internal implementation changes that don't affect the public API
- Changes to non-exported (private) symbols

Here are the changes to analyze:
${context.join('\n')}

Analyze these changes and respond with ONLY a valid JSON object (no markdown, no explanation) in this exact format:
{
  "breaking_changes": [
    {
      "file": "path/to/file.ts",
      "symbol": "symbolName",
      "change_type": "removed|signature_change|type_incompatible|visibility_change",
      "before": "previous signature or definition",
      "after": "new signature or definition (empty if removed)",
      "impact": "description of impact on consumers",
      "migration": "suggested migration steps"
    }
  ],
  "non_breaking_changes": [
    {
      "file": "path/to/file.ts",
      "symbol": "symbolName",
      "change_type": "added|enhanced|internal",
      "description": "description of the change"
    }
  ],
  "severity": "none|minor|major"
}

Rules for severity:
- "none": No breaking changes
- "minor": Only parameter additions with defaults, or type narrowing
- "major": Any other breaking changes

If there are no relevant API changes, return empty arrays and severity "none".`;

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
        // If Claude CLI fails, return a fallback analysis
        console.warn(`Claude CLI exited with code ${code}: ${stderr}`);
        resolve({
          breaking_changes: [],
          non_breaking_changes: changedFiles.map(f => ({
            file: f.file,
            symbol: '*',
            change_type: f.status === 'A' ? 'added' : f.status === 'D' ? 'removed' : 'modified',
            description: `File ${f.status === 'A' ? 'added' : f.status === 'D' ? 'deleted' : 'modified'} (LLM analysis unavailable)`,
          })),
          severity: 'none' as const,
        });
        return;
      }

      try {
        // Extract JSON from the response (Claude might include extra text)
        const jsonMatch = stdout.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in response');
        }

        const result = JSON.parse(jsonMatch[0]) as DetectBreakingChangesResult;
        resolve(result);
      } catch (parseError) {
        console.warn('Failed to parse LLM response:', parseError);
        console.warn('Raw response:', stdout);
        resolve({
          breaking_changes: [],
          non_breaking_changes: [],
          severity: 'none' as const,
        });
      }
    });

    claudeProcess.on('error', (error) => {
      console.warn('Failed to spawn Claude CLI:', error);
      resolve({
        breaking_changes: [],
        non_breaking_changes: [],
        severity: 'none' as const,
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
 * Handles the detect_breaking_changes MCP tool call.
 *
 * Compares type signatures between git refs and uses LLM to analyze
 * which changes constitute breaking API changes.
 *
 * @param args - The detect_breaking_changes tool arguments
 * @returns MCP tool response with breaking changes analysis
 *
 * @example
 * // Check for breaking changes since last commit
 * await handleDetectBreakingChanges({
 *   before_ref: 'HEAD~1'
 * });
 */
export async function handleDetectBreakingChanges(
  args: DetectBreakingChangesArgs
): Promise<ToolResponse> {
  // Validate required arguments
  if (!args.before_ref) {
    return createErrorResponse('Missing required argument: before_ref');
  }

  const beforeRef = args.before_ref;
  const afterRef = args.after_ref ?? 'HEAD';
  const pathFilter = args.path;

  try {
    // Verify git is available and refs exist
    try {
      execSync(`git rev-parse ${beforeRef}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
      execSync(`git rev-parse ${afterRef}`, { cwd: PROJECT_ROOT, stdio: 'pipe' });
    } catch {
      return createErrorResponse(`Invalid git refs: ${beforeRef} or ${afterRef}`);
    }

    // Get changed files
    const changedFiles = getChangedFiles(beforeRef, afterRef, pathFilter);

    if (changedFiles.length === 0) {
      return createSuccessResponse({
        breaking_changes: [],
        non_breaking_changes: [],
        severity: 'none',
        message: 'No TypeScript/JavaScript files changed between refs',
      });
    }

    // Extract type information for before and after states
    const beforeTypes = new Map<string, FileTypeInfo>();
    const afterTypes = new Map<string, FileTypeInfo>();

    for (const { file, status } of changedFiles) {
      // Get before state (unless file was added)
      if (status !== 'A') {
        const beforeContent = getFileAtRef(file, beforeRef);
        if (beforeContent) {
          const typeInfo = await extractTypeInfoFromContent(file, beforeContent);
          beforeTypes.set(file, typeInfo);
        }
      }

      // Get after state (unless file was deleted)
      if (status !== 'D') {
        const afterContent = getFileAtRef(file, afterRef);
        if (afterContent) {
          const typeInfo = await extractTypeInfoFromContent(file, afterContent);
          afterTypes.set(file, typeInfo);
        }
      }
    }

    // Analyze changes with LLM
    const result = await analyzeWithLLM(changedFiles, beforeTypes, afterTypes);

    // Ensure file paths are relative
    result.breaking_changes = result.breaking_changes.map(change => ({
      ...change,
      file: change.file.startsWith('/')
        ? makeRelativePath(change.file, PROJECT_ROOT)
        : change.file,
    }));

    result.non_breaking_changes = result.non_breaking_changes.map(change => ({
      ...change,
      file: change.file.startsWith('/')
        ? makeRelativePath(change.file, PROJECT_ROOT)
        : change.file,
    }));

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to detect breaking changes: ${message}`);
  }
}
