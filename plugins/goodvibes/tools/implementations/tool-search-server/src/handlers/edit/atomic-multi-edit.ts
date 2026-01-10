/**
 * Atomic Multi-Edit Handler
 *
 * Performs multiple file edits atomically with rollback on validation failure.
 * Creates backups before modification and restores them if validation fails.
 *
 * @module handlers/edit/atomic-multi-edit
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PROJECT_ROOT } from '../../config.js';
import { safeExec, fileExists } from '../../utils.js';

// =============================================================================
// Types
// =============================================================================

/** A single edit operation */
export interface EditOperation {
  /** File path (relative to project root or absolute) */
  file: string;
  /** Text to find and replace */
  old_text: string;
  /** Replacement text */
  new_text: string;
}

/** Validation options */
export interface ValidationOptions {
  /** Run tsc --noEmit */
  type_check?: boolean;
  /** Run eslint */
  lint?: boolean;
  /** Run tests */
  test?: boolean;
  /** Custom validation command */
  custom?: string;
}

/** Arguments for atomic_multi_edit tool */
export interface AtomicMultiEditArgs {
  /** List of edits to apply */
  edits: EditOperation[];
  /** Validation options */
  validate?: ValidationOptions;
  /** Preview only, don't apply */
  dry_run?: boolean;
}

/** Result for a single edit */
interface EditResult {
  /** File path (relative) */
  file: string;
  /** Whether the edit succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether old_text was found */
  old_text_found: boolean;
}

/** Validation result for a single check */
interface ValidationCheckResult {
  /** Whether validation passed */
  passed: boolean;
  /** Errors if validation failed */
  errors?: string[];
  /** Output from validation command */
  output?: string;
}

/** Overall validation result */
interface ValidationResult {
  /** Whether all validations passed */
  passed: boolean;
  /** Type check result */
  type_check?: ValidationCheckResult;
  /** Lint result */
  lint?: ValidationCheckResult;
  /** Test result */
  test?: ValidationCheckResult;
  /** Custom command result */
  custom?: ValidationCheckResult;
}

/** Result of atomic multi-edit operation */
export interface AtomicMultiEditResult {
  /** Whether the entire operation succeeded */
  success: boolean;
  /** Whether edits were actually applied */
  applied: boolean;
  /** Results for each edit */
  edits: EditResult[];
  /** Validation results */
  validation?: ValidationResult;
  /** Whether rollback was performed */
  rollback_performed: boolean;
  /** Paths to backup files */
  backup_paths?: string[];
}

/** MCP tool response format */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Backup Management
// =============================================================================

/** In-memory backup of file contents */
interface FileBackup {
  /** Original file path */
  filePath: string;
  /** Original content */
  content: string;
  /** Backup file path on disk */
  backupPath: string;
}

/**
 * Create backup directory for this operation
 */
async function createBackupDir(): Promise<string> {
  const timestamp = Date.now();
  const backupDir = path.join(PROJECT_ROOT, '.goodvibes', 'backups', `atomic-${timestamp}`);
  await fs.mkdir(backupDir, { recursive: true });
  return backupDir;
}

/**
 * Create backup of a file
 */
async function backupFile(filePath: string, backupDir: string): Promise<FileBackup> {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.relative(PROJECT_ROOT, filePath);
  const safeFileName = relativePath.replace(/[/\\]/g, '__');
  const backupPath = path.join(backupDir, safeFileName);

  await fs.writeFile(backupPath, content, 'utf-8');

  return {
    filePath,
    content,
    backupPath,
  };
}

/**
 * Restore file from backup
 */
async function restoreFile(backup: FileBackup): Promise<void> {
  await fs.writeFile(backup.filePath, backup.content, 'utf-8');
}

/**
 * Clean up backup directory
 */
async function cleanupBackups(backupDir: string): Promise<void> {
  try {
    await fs.rm(backupDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

// =============================================================================
// Edit Operations
// =============================================================================

/**
 * Resolve file path to absolute
 */
function resolveFilePath(filePath: string): string {
  return path.isAbsolute(filePath)
    ? filePath
    : path.resolve(PROJECT_ROOT, filePath);
}

/**
 * Make path relative to project root
 */
function makeRelativePath(absolutePath: string): string {
  return path.relative(PROJECT_ROOT, absolutePath).replace(/\\/g, '/');
}

/**
 * Apply a single edit to a file
 */
async function applyEdit(
  edit: EditOperation,
  backups: Map<string, FileBackup>
): Promise<EditResult> {
  const absolutePath = resolveFilePath(edit.file);
  const relativePath = makeRelativePath(absolutePath);

  // Check if file exists
  if (!(await fileExists(absolutePath))) {
    return {
      file: relativePath,
      success: false,
      error: 'File not found',
      old_text_found: false,
    };
  }

  try {
    // Get content (from backup if already read, otherwise from file)
    let content: string;
    const existingBackup = backups.get(absolutePath);
    if (existingBackup) {
      // Read current state of file (may have been modified by previous edits)
      content = await fs.readFile(absolutePath, 'utf-8');
    } else {
      content = await fs.readFile(absolutePath, 'utf-8');
    }

    // Check if old_text exists
    if (!content.includes(edit.old_text)) {
      return {
        file: relativePath,
        success: false,
        error: 'old_text not found in file',
        old_text_found: false,
      };
    }

    // Replace old_text with new_text
    const newContent = content.replace(edit.old_text, edit.new_text);

    // Write back to file
    await fs.writeFile(absolutePath, newContent, 'utf-8');

    return {
      file: relativePath,
      success: true,
      old_text_found: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return {
      file: relativePath,
      success: false,
      error: message,
      old_text_found: false,
    };
  }
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Run type checking validation
 */
async function runTypeCheck(files: string[]): Promise<ValidationCheckResult> {
  // Run tsc --noEmit on the project
  const result = await safeExec('npx tsc --noEmit 2>&1', PROJECT_ROOT, 60000);

  if (result.error || result.stderr || result.stdout) {
    const output = (result.stdout + '\n' + result.stderr).trim();

    // Parse errors
    const errorRegex = /(.+)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)/g;
    const errors: string[] = [];
    let match;

    while ((match = errorRegex.exec(output)) !== null) {
      errors.push(`${match[1]}:${match[2]}:${match[3]} - ${match[4]}: ${match[5]}`);
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        output,
      };
    }
  }

  return { passed: true };
}

/**
 * Run ESLint validation
 */
async function runLint(files: string[]): Promise<ValidationCheckResult> {
  // Get unique files that were edited
  const fileArgs = files.map(f => `"${f}"`).join(' ');

  // Run eslint with JSON format for easier parsing
  const result = await safeExec(
    `npx eslint --format=json ${fileArgs} 2>&1`,
    PROJECT_ROOT,
    60000
  );

  try {
    // Try to parse JSON output
    const output = result.stdout || result.stderr || '';
    const lintResults = JSON.parse(output);

    const errors: string[] = [];
    for (const fileResult of lintResults) {
      for (const message of fileResult.messages || []) {
        if (message.severity >= 2) {
          // severity 2 = error
          errors.push(
            `${fileResult.filePath}:${message.line}:${message.column} - ${message.ruleId}: ${message.message}`
          );
        }
      }
    }

    if (errors.length > 0) {
      return {
        passed: false,
        errors,
        output,
      };
    }

    return { passed: true };
  } catch {
    // If JSON parsing fails, check for error exit
    if (result.error) {
      return {
        passed: false,
        errors: ['ESLint failed to run'],
        output: result.stdout + '\n' + result.stderr,
      };
    }
    return { passed: true };
  }
}

/**
 * Run test validation
 */
async function runTests(): Promise<ValidationCheckResult> {
  const result = await safeExec('npm test 2>&1', PROJECT_ROOT, 120000);

  if (result.error) {
    return {
      passed: false,
      output: (result.stdout + '\n' + result.stderr).trim(),
    };
  }

  return {
    passed: true,
    output: result.stdout,
  };
}

/**
 * Run custom validation command
 */
async function runCustomValidation(command: string): Promise<ValidationCheckResult> {
  const result = await safeExec(command + ' 2>&1', PROJECT_ROOT, 60000);

  if (result.error) {
    return {
      passed: false,
      output: (result.stdout + '\n' + result.stderr).trim(),
    };
  }

  return {
    passed: true,
    output: result.stdout,
  };
}

/**
 * Run all requested validations
 */
async function runValidation(
  options: ValidationOptions,
  editedFiles: string[]
): Promise<ValidationResult> {
  const result: ValidationResult = { passed: true };

  if (options.type_check) {
    result.type_check = await runTypeCheck(editedFiles);
    if (!result.type_check.passed) {
      result.passed = false;
    }
  }

  if (options.lint) {
    result.lint = await runLint(editedFiles);
    if (!result.lint.passed) {
      result.passed = false;
    }
  }

  if (options.test) {
    result.test = await runTests();
    if (!result.test.passed) {
      result.passed = false;
    }
  }

  if (options.custom) {
    result.custom = await runCustomValidation(options.custom);
    if (!result.custom.passed) {
      result.passed = false;
    }
  }

  return result;
}

// =============================================================================
// Main Handler
// =============================================================================

/**
 * Handle atomic_multi_edit MCP tool call.
 *
 * Performs multiple file edits atomically with rollback on validation failure.
 *
 * @param args - The tool arguments
 * @returns MCP tool response with edit results
 */
export async function handleAtomicMultiEdit(
  args: AtomicMultiEditArgs
): Promise<ToolResponse> {
  const result: AtomicMultiEditResult = {
    success: false,
    applied: false,
    edits: [],
    rollback_performed: false,
  };

  // Validate input
  if (!args.edits || args.edits.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: 'No edits provided' }, null, 2),
        },
      ],
      isError: true,
    };
  }

  // Create backup directory
  let backupDir: string | null = null;
  const backups = new Map<string, FileBackup>();

  try {
    // Phase 1: Create backups
    backupDir = await createBackupDir();
    result.backup_paths = [];

    const uniqueFiles = new Set<string>();
    for (const edit of args.edits) {
      const absolutePath = resolveFilePath(edit.file);
      uniqueFiles.add(absolutePath);
    }

    for (const filePath of uniqueFiles) {
      if (await fileExists(filePath)) {
        const backup = await backupFile(filePath, backupDir);
        backups.set(filePath, backup);
        result.backup_paths.push(backup.backupPath);
      }
    }

    // Phase 2: Apply edits (or simulate for dry_run)
    if (args.dry_run) {
      // In dry run, validate that all edits would succeed without applying
      for (const edit of args.edits) {
        const absolutePath = resolveFilePath(edit.file);
        const relativePath = makeRelativePath(absolutePath);

        if (!(await fileExists(absolutePath))) {
          result.edits.push({
            file: relativePath,
            success: false,
            error: 'File not found',
            old_text_found: false,
          });
          continue;
        }

        const content = await fs.readFile(absolutePath, 'utf-8');
        const found = content.includes(edit.old_text);

        result.edits.push({
          file: relativePath,
          success: found,
          error: found ? undefined : 'old_text not found in file',
          old_text_found: found,
        });
      }

      // Check if all edits would succeed
      const allEditsSuccessful = result.edits.every((e) => e.success);

      // Run validation on current state (if requested, for dry run info)
      if (args.validate && Object.keys(args.validate).length > 0) {
        const editedFiles = [...uniqueFiles].map(makeRelativePath);
        result.validation = await runValidation(args.validate, editedFiles);
      }

      result.success = allEditsSuccessful;
      result.applied = false;

      // Clean up backups for dry run
      if (backupDir) {
        await cleanupBackups(backupDir);
        result.backup_paths = undefined;
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...result,
                message: 'Dry run completed - no changes applied',
              },
              null,
              2
            ),
          },
        ],
      };
    }

    // Actually apply edits
    for (const edit of args.edits) {
      const editResult = await applyEdit(edit, backups);
      result.edits.push(editResult);
    }

    // Check if any edit failed
    const allEditsSuccessful = result.edits.every((e) => e.success);

    if (!allEditsSuccessful) {
      // Rollback all changes
      for (const backup of backups.values()) {
        await restoreFile(backup);
      }
      result.rollback_performed = true;
      result.success = false;
      result.applied = false;

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                ...result,
                message: 'Edits failed - all changes rolled back',
              },
              null,
              2
            ),
          },
        ],
        isError: true,
      };
    }

    result.applied = true;

    // Phase 3: Run validation (if requested)
    if (args.validate && Object.keys(args.validate).length > 0) {
      const editedFiles = [...uniqueFiles].map(makeRelativePath);
      result.validation = await runValidation(args.validate, editedFiles);

      if (!result.validation.passed) {
        // Validation failed - rollback
        for (const backup of backups.values()) {
          await restoreFile(backup);
        }
        result.rollback_performed = true;
        result.success = false;
        result.applied = false;

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  ...result,
                  message: 'Validation failed - all changes rolled back',
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }

    // Success - clean up backups
    if (backupDir) {
      await cleanupBackups(backupDir);
      result.backup_paths = undefined;
    }

    result.success = true;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...result,
              message: 'All edits applied successfully',
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (err) {
    // Unexpected error - try to rollback
    if (backups.size > 0) {
      for (const backup of backups.values()) {
        try {
          await restoreFile(backup);
        } catch {
          // Ignore restore errors in error handler
        }
      }
      result.rollback_performed = true;
    }

    const message = err instanceof Error ? err.message : 'Unknown error';

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              ...result,
              error: message,
              message: 'Unexpected error - changes rolled back',
            },
            null,
            2
          ),
        },
      ],
      isError: true,
    };
  }
}
