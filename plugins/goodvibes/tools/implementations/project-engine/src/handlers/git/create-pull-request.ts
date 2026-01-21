/**
 * Create Pull Request Handler
 *
 * Creates GitHub pull requests with auto-generated descriptions using LLM analysis
 * of the changes. Handles git state detection, branch pushing, and PR creation
 * via the gh CLI.
 *
 * @module handlers/git/create-pull-request
 */

import { execSync, spawnSync } from 'child_process';
import * as path from 'path';

import { PROJECT_ROOT } from '../../config.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the create_pull_request tool.
 */
export interface CreatePullRequestArgs {
  /** Base branch for the PR (default: "main") */
  base?: string;
  /** PR title (auto-generate if not provided) */
  title?: string;
  /** PR body/description (auto-generate if not provided) */
  body?: string;
  /** Create as draft PR (default: false) */
  draft?: boolean;
  /** Labels to add to the PR */
  labels?: string[];
  /** Reviewer usernames to request */
  reviewers?: string[];
  /** Use LLM for description generation (default: true) */
  auto_description?: boolean;
}

/**
 * Result of the create_pull_request tool.
 */
export interface CreatePullRequestResult {
  /** Whether the PR was created successfully */
  success: boolean;
  /** URL of the created PR */
  pr_url?: string;
  /** PR number */
  pr_number?: number;
  /** PR title */
  title: string;
  /** PR body/description */
  body: string;
  /** Base branch */
  base_branch: string;
  /** Head branch (current branch) */
  head_branch: string;
  /** Number of files changed */
  files_changed: number;
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Number of commits in the PR */
  commits: number;
  /** Labels applied */
  labels: string[];
  /** Whether it's a draft PR */
  draft: boolean;
  /** Error message if creation failed */
  error?: string;
}

/**
 * Git information about the current branch and changes.
 */
interface GitInfo {
  /** Current branch name */
  currentBranch: string;
  /** Base branch for comparison */
  baseBranch: string;
  /** Diff statistics output */
  diffStat: string;
  /** Number of files changed */
  filesChanged: number;
  /** Lines added */
  additions: number;
  /** Lines deleted */
  deletions: number;
  /** Commit messages in the PR */
  commits: string[];
  /** Number of commits */
  commitCount: number;
  /** Files that have changed */
  changedFiles: string[];
}

/**
 * Standard MCP tool response format.
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a successful MCP tool response with JSON content.
 */
function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Create an error MCP tool response.
 */
function createErrorResponse(
  message: string,
  context?: Record<string, unknown>
): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message, ...context }, null, 2) }],
    isError: true,
  };
}

/**
 * Execute a git command and return the output.
 * Returns null if the command fails.
 */
function execGit(command: string, cwd: string): string | null {
  try {
    return execSync(`git ${command}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

/**
 * Check if gh CLI is installed and authenticated.
 */
function checkGhCli(): { installed: boolean; authenticated: boolean; error?: string } {
  try {
    // Check if gh is installed
    const versionResult = spawnSync('gh', ['--version'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (versionResult.status !== 0) {
      return {
        installed: false,
        authenticated: false,
        error: 'GitHub CLI (gh) is not installed. Install it from https://cli.github.com/',
      };
    }

    // Check if gh is authenticated
    const authResult = spawnSync('gh', ['auth', 'status'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (authResult.status !== 0) {
      return {
        installed: true,
        authenticated: false,
        error: 'GitHub CLI is not authenticated. Run "gh auth login" to authenticate.',
      };
    }

    return { installed: true, authenticated: true };
  } catch (e) {
    return {
      installed: false,
      authenticated: false,
      error: `Failed to check gh CLI: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Get git information about the current branch and changes.
 */
function getGitInfo(cwd: string, baseBranch: string): GitInfo | null {
  const currentBranch = execGit('branch --show-current', cwd);
  if (!currentBranch) {
    return null;
  }

  // Get diff stat
  const diffStat = execGit(`diff --stat ${baseBranch}...HEAD`, cwd) || '';

  // Get changed files
  const changedFilesRaw = execGit(`diff --name-only ${baseBranch}...HEAD`, cwd) || '';
  const changedFiles = changedFilesRaw.split('\n').filter(Boolean);

  // Get diff summary for additions/deletions
  const diffNumstat = execGit(`diff --numstat ${baseBranch}...HEAD`, cwd) || '';
  let additions = 0;
  let deletions = 0;

  for (const line of diffNumstat.split('\n').filter(Boolean)) {
    const [add, del] = line.split('\t');
    if (add !== '-') additions += parseInt(add, 10) || 0;
    if (del !== '-') deletions += parseInt(del, 10) || 0;
  }

  // Get commits
  const commitsRaw = execGit(`log ${baseBranch}..HEAD --oneline`, cwd) || '';
  const commits = commitsRaw.split('\n').filter(Boolean);

  return {
    currentBranch,
    baseBranch,
    diffStat,
    filesChanged: changedFiles.length,
    additions,
    deletions,
    commits,
    commitCount: commits.length,
    changedFiles,
  };
}

/**
 * Generate a PR title from commits and branch name.
 */
function generateTitle(commits: string[], branchName: string): string {
  // If branch follows convention (feat/xyz, fix/xyz), use that
  const branchMatch = branchName.match(/^(feat|fix|chore|docs|refactor|test|style|perf|ci|build|revert)\/(.+)/i);
  if (branchMatch) {
    const type = branchMatch[1].toLowerCase();
    const description = branchMatch[2].replace(/[-_]/g, ' ');
    return `${type}: ${description}`;
  }

  // Otherwise use first commit message (strip hash prefix)
  if (commits.length > 0) {
    return commits[0].replace(/^[a-f0-9]+\s+/, '');
  }

  return `Changes from ${branchName}`;
}

/**
 * Generate PR description using LLM (Claude CLI).
 * Falls back to a simple template if LLM is unavailable.
 */
async function generateDescription(gitInfo: GitInfo, cwd: string): Promise<string> {
  // Get the actual diff content (truncated for LLM)
  const diff = execGit(`diff ${gitInfo.baseBranch}...HEAD`, cwd) || '';
  const truncatedDiff = diff.slice(0, 15000);

  const prompt = `Generate a concise pull request description for these changes.

Branch: ${gitInfo.currentBranch} -> ${gitInfo.baseBranch}

Commits:
${gitInfo.commits.join('\n')}

Files changed (${gitInfo.filesChanged}):
${gitInfo.changedFiles.slice(0, 20).join('\n')}${gitInfo.changedFiles.length > 20 ? `\n... and ${gitInfo.changedFiles.length - 20} more` : ''}

Stats: +${gitInfo.additions} -${gitInfo.deletions}

Diff (truncated):
\`\`\`
${truncatedDiff}
\`\`\`

Generate a PR description with:
1. ## Summary - 2-3 bullet points summarizing the changes
2. ## Changes - Brief description of what was changed
3. ## Test Plan - How to test these changes

Keep it concise. Use markdown formatting. Do not include any preamble or explanation, just output the PR description directly.`;

  try {
    // Try to call Claude CLI for description generation
    const result = spawnSync('claude', ['-p', prompt, '--output-format', 'text'], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      timeout: 60000, // 60 second timeout
    });

    if (result.status === 0 && result.stdout) {
      return result.stdout.trim();
    }
  } catch {
    // Fall through to template
  }

  // Fallback to template-based description
  return generateTemplateDescription(gitInfo);
}

/**
 * Generate a simple template-based PR description without LLM.
 */
function generateTemplateDescription(gitInfo: GitInfo): string {
  const commitList = gitInfo.commits
    .slice(0, 10)
    .map((c) => `- ${c.replace(/^[a-f0-9]+\s+/, '')}`)
    .join('\n');

  const fileList = gitInfo.changedFiles
    .slice(0, 15)
    .map((f) => `- \`${f}\``)
    .join('\n');

  return `## Summary

This PR contains ${gitInfo.commitCount} commit${gitInfo.commitCount !== 1 ? 's' : ''} with changes to ${gitInfo.filesChanged} file${gitInfo.filesChanged !== 1 ? 's' : ''}.

## Changes

### Commits
${commitList}${gitInfo.commits.length > 10 ? `\n- ... and ${gitInfo.commits.length - 10} more` : ''}

### Files Changed
${fileList}${gitInfo.changedFiles.length > 15 ? `\n- ... and ${gitInfo.changedFiles.length - 15} more` : ''}

### Stats
- **Additions:** +${gitInfo.additions}
- **Deletions:** -${gitInfo.deletions}

## Test Plan

- [ ] Review the changes
- [ ] Run tests locally
- [ ] Verify no regressions`;
}

/**
 * Ensure the current branch is pushed to remote.
 */
function ensurePushed(cwd: string): { pushed: boolean; error?: string } {
  const status = execGit('status -sb', cwd);
  if (!status) {
    return { pushed: false, error: 'Failed to get git status' };
  }

  const currentBranch = execGit('branch --show-current', cwd);
  if (!currentBranch) {
    return { pushed: false, error: 'Failed to get current branch' };
  }

  // Check if there's an upstream branch
  const upstream = execGit(`rev-parse --abbrev-ref ${currentBranch}@{upstream}`, cwd);

  if (!upstream) {
    // No upstream, push with -u
    try {
      execSync(`git push -u origin ${currentBranch}`, {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { pushed: true };
    } catch (e) {
      return {
        pushed: false,
        error: `Failed to push branch: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  // Check if we're ahead of remote
  if (status.includes('[ahead')) {
    try {
      execSync('git push', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return { pushed: true };
    } catch (e) {
      return {
        pushed: false,
        error: `Failed to push commits: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  return { pushed: true };
}

/**
 * Escape a string for use in shell command arguments.
 */
function escapeShellArg(arg: string): string {
  // Replace double quotes with escaped double quotes
  return arg.replace(/"/g, '\\"');
}

/**
 * Create the pull request using gh CLI.
 */
function createPR(options: {
  base: string;
  title: string;
  body: string;
  draft: boolean;
  labels: string[];
  reviewers: string[];
  cwd: string;
}): { success: boolean; pr_url?: string; pr_number?: number; error?: string } {
  const args = [
    'pr',
    'create',
    '--base',
    options.base,
    '--title',
    options.title,
    '--body',
    options.body,
  ];

  if (options.draft) {
    args.push('--draft');
  }

  for (const label of options.labels) {
    args.push('--label', label);
  }

  for (const reviewer of options.reviewers) {
    args.push('--reviewer', reviewer);
  }

  try {
    const result = spawnSync('gh', args, {
      cwd: options.cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
      const errorOutput = result.stderr || result.stdout || 'Unknown error';
      return {
        success: false,
        error: `gh pr create failed: ${errorOutput}`,
      };
    }

    const output = result.stdout.trim();

    // Parse PR URL from output (gh outputs the URL on success)
    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const prUrl = urlMatch ? urlMatch[0] : undefined;

    // Extract PR number from URL
    const prNumberMatch = prUrl?.match(/\/pull\/(\d+)/);
    const prNumber = prNumberMatch ? parseInt(prNumberMatch[1], 10) : undefined;

    return {
      success: true,
      pr_url: prUrl,
      pr_number: prNumber,
    };
  } catch (e) {
    return {
      success: false,
      error: `Failed to create PR: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/**
 * Detect the default branch for the repository.
 */
function detectDefaultBranch(cwd: string): string {
  // Try to get from remote HEAD
  const remoteHead = execGit('symbolic-ref refs/remotes/origin/HEAD', cwd);
  if (remoteHead) {
    const match = remoteHead.match(/refs\/remotes\/origin\/(.+)/);
    if (match) {
      return match[1];
    }
  }

  // Check common defaults
  const mainExists = execGit('rev-parse --verify origin/main', cwd);
  if (mainExists) return 'main';

  const masterExists = execGit('rev-parse --verify origin/master', cwd);
  if (masterExists) return 'master';

  // Fall back to 'main'
  return 'main';
}

// =============================================================================
// Handler
// =============================================================================

/**
 * Handle the create_pull_request MCP tool call.
 *
 * Creates a GitHub pull request with auto-generated descriptions using LLM
 * analysis of the changes. Handles git state detection, branch pushing, and
 * PR creation via the gh CLI.
 *
 * @param args - The create_pull_request tool arguments
 * @returns MCP tool response with PR creation result
 *
 * @example
 * ```typescript
 * const result = await handleCreatePullRequest({
 *   base: 'main',
 *   draft: true,
 *   labels: ['enhancement'],
 *   reviewers: ['teammate']
 * });
 * ```
 */
export async function handleCreatePullRequest(
  args: CreatePullRequestArgs
): Promise<ToolResponse> {
  try {
    const cwd = PROJECT_ROOT;

    // Check gh CLI availability
    const ghCheck = checkGhCli();
    if (!ghCheck.installed || !ghCheck.authenticated) {
      return createErrorResponse(ghCheck.error || 'GitHub CLI is not available');
    }

    // Detect base branch
    const baseBranch = args.base || detectDefaultBranch(cwd);

    // Get git info
    const gitInfo = getGitInfo(cwd, baseBranch);
    if (!gitInfo) {
      return createErrorResponse('Failed to get git information. Make sure you are in a git repository.');
    }

    // Validate we're not on the base branch
    if (gitInfo.currentBranch === baseBranch) {
      return createErrorResponse(
        `Cannot create PR from ${baseBranch} to ${baseBranch}. Switch to a feature branch first.`
      );
    }

    // Validate there are changes
    if (gitInfo.commitCount === 0) {
      return createErrorResponse(
        `No commits found between ${baseBranch} and ${gitInfo.currentBranch}. Make sure you have commits to push.`
      );
    }

    // Ensure branch is pushed
    const pushResult = ensurePushed(cwd);
    if (!pushResult.pushed) {
      return createErrorResponse(pushResult.error || 'Failed to push branch to remote');
    }

    // Generate title if not provided
    const title = args.title || generateTitle(gitInfo.commits, gitInfo.currentBranch);

    // Generate body if not provided
    let body: string;
    if (args.body) {
      body = args.body;
    } else if (args.auto_description !== false) {
      // Use LLM description by default
      body = await generateDescription(gitInfo, cwd);
    } else {
      // Use template description
      body = generateTemplateDescription(gitInfo);
    }

    // Create the PR
    const prResult = createPR({
      base: baseBranch,
      title,
      body,
      draft: args.draft ?? false,
      labels: args.labels ?? [],
      reviewers: args.reviewers ?? [],
      cwd,
    });

    if (!prResult.success) {
      return createErrorResponse(prResult.error || 'Failed to create pull request');
    }

    // Build successful result
    const result: CreatePullRequestResult = {
      success: true,
      pr_url: prResult.pr_url,
      pr_number: prResult.pr_number,
      title,
      body,
      base_branch: baseBranch,
      head_branch: gitInfo.currentBranch,
      files_changed: gitInfo.filesChanged,
      additions: gitInfo.additions,
      deletions: gitInfo.deletions,
      commits: gitInfo.commitCount,
      labels: args.labels ?? [],
      draft: args.draft ?? false,
    };

    return createSuccessResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return createErrorResponse(`Failed to create pull request: ${message}`);
  }
}
