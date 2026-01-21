/**
 * Diagnose Overflow Handler
 *
 * Analyzes CSS/Tailwind layout patterns to diagnose overflow issues and
 * recommend fixes. Leverages the analyze_layout_hierarchy handler to parse
 * JSX/TSX files, then identifies overflow-prone patterns and generates
 * actionable fix options.
 *
 * @module handlers/frontend/diagnose-overflow
 */

// Re-export everything from the modular implementation
export {
  handleDiagnoseOverflow,
  type DiagnoseOverflowArgs,
  type DiagnoseOverflowResult,
  type OverflowPattern,
  type ConstraintChainEntry,
  type FixOption,
  type Recommendation,
  type Diagnosis,
  type ToolResponse,
} from './overflow-diagnosis/index.js';
