/**
 * Error Handling Tools
 *
 * Provides tools for parsing and analyzing error stack traces:
 * - Stack trace parsing with file/line/column extraction
 * - Project file identification
 * - Root cause analysis
 * - Code preview generation
 * - TypeScript error code explanations
 */

// Stack Parser
export { handleParseErrorStack } from './stack-parser.js';
export type { ParseErrorStackArgs, ParseErrorStackResult, StackFrame } from './stack-parser.js';

// Type Error Explainer
export { handleExplainTypeError } from './type-explainer.js';
export type { ExplainTypeErrorArgs, TypeErrorExplanation } from './type-explainer.js';
