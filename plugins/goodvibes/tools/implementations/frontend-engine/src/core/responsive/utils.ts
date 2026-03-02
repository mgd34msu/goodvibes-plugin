/**
 * Utility functions for Analyze Responsive Breakpoints
 *
 * @module core/responsive/utils
 */

import * as path from 'path';
import { normalizeFilePath } from '../../shared/utils.js';

// =============================================================================
// Path Helpers
// =============================================================================

export function makeRelativePath(absolutePath: string, projectRoot: string): string {
  return normalizeFilePath(path.relative(projectRoot, absolutePath));
}
