/**
 * npm registry utilities for the deps domain.
 *
 * @module core/deps/registry
 */

/**
 * Extracts GitHub repository owner and repo name from npm package metadata.
 *
 * Parses GitHub URL patterns from the repository or homepage fields.
 *
 * @param packageJson - Partial npm package metadata with repository/homepage
 * @returns Object with `owner` and `repo`, or null if not a GitHub package
 */
export function extractGitHubRepo(
  packageJson: {
    repository?: { type?: string; url?: string };
    homepage?: string;
  }
): { owner: string; repo: string } | null {
  const repoUrl = packageJson.repository?.url || packageJson.homepage || '';

  // Match GitHub URL patterns
  // Single pattern covers both SSH (github.com:owner/repo) and HTTPS (github.com/owner/repo) forms
  const patterns = [
    /github\.com[/:]([^/]+)\/([^/.]+)/,
  ];

  for (const pattern of patterns) {
    const match = repoUrl.match(pattern);
    if (match) {
      return {
        owner: match[1],
        repo: match[2].replace(/\.git$/, ''),
      };
    }
  }

  return null;
}
