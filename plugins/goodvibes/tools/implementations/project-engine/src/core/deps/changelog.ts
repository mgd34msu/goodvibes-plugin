/**
 * Changelog parsing and warning generation utilities for the deps domain.
 *
 * @module core/deps/changelog
 */

/**
 * Breaking change information extracted from a changelog.
 */
export interface BreakingChange {
  type: 'api' | 'config' | 'behavior' | 'deprecation';
  description: string;
  migration_hint?: string;
}

/**
 * Parses changelog content to extract breaking changes.
 *
 * Searches for common breaking-change indicators (headings, markers,
 * warning emoji, "removed" patterns) and classifies them by type.
 *
 * @param changelogContent - Raw changelog markdown text, or null
 * @returns Deduplicated array of detected breaking changes
 */
export function parseBreakingChanges(
  changelogContent: string | null
): BreakingChange[] {
  const breakingChanges: BreakingChange[] = [];

  if (!changelogContent) {
    return breakingChanges;
  }

  // Look for breaking change indicators
  const breakingPatterns = [
    /breaking\s*changes?[:\s]*([^\n]+(?:\n(?!\n)[^\n]+)*)/gi,
    /\*\*breaking\*\*[:\s]*([^\n]+)/gi,
    /\u26a0\ufe0f\s*([^\n]+)/g,
    /removed[:\s]*([^\n]+)/gi,
  ];

  for (const pattern of breakingPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(changelogContent)) !== null) {
      const description = match[1].trim().slice(0, 200);
      if (description.length > 10) {
        // Determine type based on content
        let type: BreakingChange['type'] = 'behavior';
        if (/api|function|method|signature|parameter|argument/i.test(description)) {
          type = 'api';
        } else if (/config|option|setting|environment/i.test(description)) {
          type = 'config';
        } else if (/deprecat/i.test(description)) {
          type = 'deprecation';
        }

        breakingChanges.push({
          type,
          description,
        });
      }
    }
  }

  // Dedupe by description
  const seen = new Set<string>();
  return breakingChanges.filter((bc) => {
    const key = bc.description.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Summarizes changelog content, focusing on the section for the target version.
 *
 * If no version-specific section is found, falls back to the first
 * significant section of the changelog.
 *
 * @param changelogContent - Raw changelog markdown text, or null
 * @param targetVersion - The version being upgraded to
 * @returns Summary string or null if no content
 */
export function summarizeChangelog(
  changelogContent: string | null,
  targetVersion: string
): string | null {
  if (!changelogContent) {
    return null;
  }

  // Try to find section for target version
  const escapedVersion = targetVersion.replace(/\./g, '\\.');
  const versionPattern = new RegExp(
    `(?:^|\\n)#+\\s*(?:v?${escapedVersion}|\\[?v?${escapedVersion}\\]?)\\s*([\\s\\S]*?)(?=\\n#+\\s*(?:v?\\d|\\[?v?\\d)|$)`,
    'i'
  );

  const match = changelogContent.match(versionPattern);
  if (match && match[1]) {
    // Clean up and truncate
    const summary = match[1]
      .trim()
      .split('\n')
      .slice(0, 15)
      .join('\n')
      .slice(0, 1000);
    return summary;
  }

  // Fall back to first significant section
  const firstSection = changelogContent.slice(0, 2000);
  const lines = firstSection.split('\n').filter((l) => l.trim()).slice(0, 10);
  return lines.join('\n');
}

/**
 * Generates upgrade warning messages based on analysis results.
 *
 * Produces human-readable warnings for major bumps, breaking changes,
 * and packages with many dependents.
 *
 * @param isMajor - Whether this is a major version bump
 * @param breakingChanges - Array of detected breaking changes
 * @param dependentsCount - Number of other packages that depend on this one
 * @returns Array of warning message strings
 */
export function generateUpgradeWarnings(
  isMajor: boolean,
  breakingChanges: BreakingChange[],
  dependentsCount: number
): string[] {
  const warnings: string[] = [];

  if (isMajor) {
    warnings.push('This is a major version upgrade. Review breaking changes carefully.');
  }

  if (breakingChanges.length > 0) {
    warnings.push(`Found ${breakingChanges.length} potential breaking change(s) in changelog.`);
  }

  if (dependentsCount > 5) {
    warnings.push(`${dependentsCount} other packages depend on this one. Test thoroughly.`);
  }

  return warnings;
}
