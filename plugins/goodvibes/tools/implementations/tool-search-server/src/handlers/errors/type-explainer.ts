/**
 * TypeScript Error Explainer
 *
 * Provides human-friendly explanations for TypeScript error codes with
 * context-aware fix suggestions based on error message patterns.
 *
 * @module handlers/errors/type-explainer
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Arguments for the explain_type_error tool
 */
export interface ExplainTypeErrorArgs {
  /** TypeScript error code (e.g., 2322, 2339) */
  error_code: number;
  /** The full error message from TypeScript */
  error_message: string;
  /** Optional code snippet where the error occurred */
  context?: string;
}

/**
 * Explanation result for a TypeScript error
 */
export interface TypeErrorExplanation {
  /** The TypeScript error code */
  code: number;
  /** Human-friendly name for the error type */
  name: string;
  /** Clear explanation of what this error means */
  explanation: string;
  /** List of common causes for this error */
  common_causes: string[];
  /** Actionable fix suggestions */
  suggested_fixes: string[];
  /** Link to TypeScript documentation */
  documentation_url: string;
}

/**
 * Internal error info structure
 */
interface ErrorInfo {
  name: string;
  explanation: string;
  common_causes: string[];
  suggested_fixes: string[];
  doc_path: string;
}

/**
 * Tool response format
 */
interface ToolResponse {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

// =============================================================================
// Error Database
// =============================================================================

/**
 * Map of TypeScript error codes to human-friendly explanations.
 * Each entry includes the error name, explanation, common causes, and fix suggestions.
 */
const ERROR_DATABASE: Record<number, ErrorInfo> = {
  // TS2304: Cannot find name
  2304: {
    name: 'Cannot Find Name',
    explanation:
      "TypeScript cannot find a variable, function, type, or module with the specified name. This usually means the identifier is not defined, not imported, or is out of scope.",
    common_causes: [
      'Identifier not imported from another module',
      'Typo in variable or function name',
      'Missing type definition package (@types/*)',
      'Variable used before declaration',
      'Identifier defined in a different scope',
    ],
    suggested_fixes: [
      'Import the missing identifier: import { Name } from "./module"',
      'Check spelling of the identifier',
      'Install type definitions: npm install -D @types/package-name',
      'Declare the variable or type before using it',
      'Check if the identifier is in scope (not inside a function or block)',
    ],
    doc_path: 'handbook/2/modules.html',
  },

  // TS2322: Type not assignable
  2322: {
    name: 'Type Assignment Error',
    explanation:
      "TypeScript found a type mismatch during assignment. The value being assigned has a type that doesn't match what the target variable, property, or parameter expects.",
    common_causes: [
      'Variable declared with a narrower type than the value',
      'Optional property being assigned to required variable',
      'Function return type mismatch',
      'Union type being assigned to a single type',
      'Literal type being assigned to a different literal',
    ],
    suggested_fixes: [
      'Add a type guard to narrow the type: if (value !== undefined) { ... }',
      'Use nullish coalescing: value ?? defaultValue',
      'Widen the target type to accept the value type',
      'Use type assertion if you are certain: value as ExpectedType',
      'Add non-null assertion if certain value exists: value!',
    ],
    doc_path: 'handbook/2/narrowing.html',
  },

  // TS2339: Property does not exist
  2339: {
    name: 'Property Does Not Exist',
    explanation:
      "TypeScript cannot find the property you're trying to access on the given type. The type definition doesn't include this property.",
    common_causes: [
      'Typo in property name',
      'Property not defined in interface or type',
      'Accessing property on wrong object',
      'Type definition is outdated or incomplete',
      'Object type is too narrow (e.g., {} instead of specific type)',
    ],
    suggested_fixes: [
      'Check the spelling of the property name',
      'Add the property to the interface or type definition',
      'Use type assertion if property exists at runtime: (obj as ExtendedType).prop',
      'Verify you are accessing the correct object',
      'Update or extend the type definition',
    ],
    doc_path: 'handbook/2/objects.html',
  },

  // TS2345: Argument not assignable
  2345: {
    name: 'Argument Type Mismatch',
    explanation:
      "The argument you're passing to a function has a type that doesn't match the expected parameter type. TypeScript is preventing a potential runtime error.",
    common_causes: [
      'Passing wrong type to function parameter',
      'Optional value passed where required value expected',
      'Array type mismatch (e.g., string[] vs readonly string[])',
      'Object shape mismatch',
      'Generic type constraint not satisfied',
    ],
    suggested_fixes: [
      'Check function signature and pass correct type',
      'Add type guard before calling: if (value !== undefined) fn(value)',
      'Cast to expected type if certain: fn(value as ExpectedType)',
      'Use spread or map to transform the argument',
      'Ensure object has all required properties',
    ],
    doc_path: 'handbook/2/functions.html',
  },

  // TS2551: Property does not exist, did you mean...
  2551: {
    name: 'Property Typo Detected',
    explanation:
      "TypeScript found a property access that doesn't exist, but detected a similar property name that might be what you meant. This is usually a typo.",
    common_causes: [
      'Typo in property name (most common)',
      'Case sensitivity issue (JavaScript is case-sensitive)',
      'Using old property name after refactoring',
      'Mixing similar APIs',
    ],
    suggested_fixes: [
      'Use the suggested property name from the error message',
      'Check the type definition for available properties',
      'Use IDE autocomplete to select correct property',
      'Search for the property definition to verify the correct name',
    ],
    doc_path: 'handbook/2/objects.html',
  },

  // TS2741: Property missing in type
  2741: {
    name: 'Required Property Missing',
    explanation:
      "An object is missing a required property. When creating or assigning an object, all required properties from the target type must be present.",
    common_causes: [
      'Forgot to include a required property when creating object',
      'Property name typo resulting in extra property instead of required one',
      'Interface was updated to require new property',
      'Spreading object that lacks the required property',
    ],
    suggested_fixes: [
      'Add the missing property to the object',
      'Make the property optional in the interface: prop?: Type',
      'Provide a default value when spreading: { ...obj, requiredProp: value }',
      'Check if the property should actually be required',
    ],
    doc_path: 'handbook/2/objects.html#property-modifiers',
  },

  // TS7006: Parameter implicitly has 'any' type
  7006: {
    name: 'Implicit Any Parameter',
    explanation:
      "TypeScript cannot infer the type of this parameter and it defaults to 'any'. With strict mode or noImplicitAny enabled, you must explicitly declare parameter types.",
    common_causes: [
      'Missing type annotation on function parameter',
      'Callback function without typed parameters',
      'Event handler without proper event typing',
      "Array method callback without type context (e.g., .map, .filter)",
    ],
    suggested_fixes: [
      'Add explicit type annotation: (param: Type) => ...',
      'Use typed callback signatures from libraries',
      'For event handlers: (e: React.ChangeEvent<HTMLInputElement>) => ...',
      'Add type parameter to generic functions',
    ],
    doc_path: 'tsconfig#noImplicitAny',
  },

  // TS7031: Binding element implicitly has 'any' type
  7031: {
    name: 'Implicit Any Binding',
    explanation:
      "A destructured parameter or binding element has an implicit 'any' type. TypeScript cannot infer its type from the context.",
    common_causes: [
      'Destructuring parameters without type annotation',
      'Destructuring from untyped source',
      'Generic callback with destructuring',
    ],
    suggested_fixes: [
      'Add type annotation to the entire destructured parameter: ({ a, b }: Props) => ...',
      'Type the source object before destructuring',
      'Use explicit type annotation inline: { a: Type, b: Type }',
    ],
    doc_path: 'tsconfig#noImplicitAny',
  },

  // Additional common errors
  // TS2307: Cannot find module
  2307: {
    name: 'Module Not Found',
    explanation:
      'TypeScript cannot find the module you are trying to import. The module either does not exist, is not installed, or the path is incorrect.',
    common_causes: [
      'Module not installed (missing from package.json)',
      'Incorrect import path',
      'Missing type definitions for JavaScript library',
      'Path alias not configured in tsconfig.json',
      'File extension issues with ESM',
    ],
    suggested_fixes: [
      'Install the package: npm install package-name',
      'Install type definitions: npm install -D @types/package-name',
      'Check the import path is correct (relative vs absolute)',
      'Configure path aliases in tsconfig.json "paths"',
      'Add file extension for ESM: import from "./file.js"',
    ],
    doc_path: 'handbook/2/modules.html',
  },

  // TS2532: Object is possibly undefined
  2532: {
    name: 'Possibly Undefined',
    explanation:
      "The value might be undefined at runtime. TypeScript is preventing you from accessing properties or calling methods on potentially undefined values.",
    common_causes: [
      'Optional property access without null check',
      'Array access that might be out of bounds',
      'Map.get() returns undefined when key not found',
      'Function might return undefined',
    ],
    suggested_fixes: [
      'Add null check: if (value !== undefined) { ... }',
      'Use optional chaining: value?.property',
      'Use nullish coalescing: value ?? defaultValue',
      'Use non-null assertion if certain: value!',
    ],
    doc_path: 'handbook/2/narrowing.html#narrowing',
  },

  // TS2531: Object is possibly null
  2531: {
    name: 'Possibly Null',
    explanation:
      "The value might be null at runtime. TypeScript is preventing you from accessing properties or calling methods on potentially null values.",
    common_causes: [
      'DOM method returns null when element not found',
      'Nullable database field',
      'Function explicitly returns null',
      'Type includes null in union',
    ],
    suggested_fixes: [
      'Add null check: if (value !== null) { ... }',
      'Use optional chaining: value?.property',
      'Use nullish coalescing: value ?? defaultValue',
      'Use non-null assertion if certain: value!',
    ],
    doc_path: 'handbook/2/narrowing.html#narrowing',
  },

  // TS2769: No overload matches this call
  2769: {
    name: 'No Matching Overload',
    explanation:
      "None of the function's overload signatures match the arguments you provided. The function has multiple signatures, but none accept the current argument types.",
    common_causes: [
      'Wrong number of arguments',
      'Wrong argument types',
      'Arguments in wrong order',
      'Missing required argument',
      'Overload signatures are complex or poorly documented',
    ],
    suggested_fixes: [
      'Check all overload signatures in the type definition',
      'Verify argument count and order',
      'Cast arguments to expected types if necessary',
      'Check documentation for valid usage patterns',
    ],
    doc_path: 'handbook/2/functions.html#function-overloads',
  },

  // TS2554: Expected N arguments, but got M
  2554: {
    name: 'Wrong Argument Count',
    explanation:
      'The number of arguments passed to the function does not match what the function expects. You are either passing too many or too few arguments.',
    common_causes: [
      'Forgot to pass required argument',
      'Passed extra arguments',
      'Function signature changed after refactoring',
      'Confusion between similar functions',
    ],
    suggested_fixes: [
      'Check function signature for required parameters',
      'Add missing arguments or remove extra ones',
      'Check if parameters should be optional',
      'Verify you are calling the correct function',
    ],
    doc_path: 'handbook/2/functions.html',
  },

  // TS18046: Value is of type 'unknown'
  18046: {
    name: 'Unknown Type Access',
    explanation:
      "You're trying to use a value typed as 'unknown' without first narrowing its type. Unlike 'any', 'unknown' requires type checking before use.",
    common_causes: [
      'Catch clause error parameter (always unknown)',
      'JSON.parse return type',
      'External data without validation',
      'Generic type resolving to unknown',
    ],
    suggested_fixes: [
      'Add type guard: if (typeof value === "string") { ... }',
      'Use instanceof for objects: if (value instanceof Error) { ... }',
      'Use type assertion after validation: value as ExpectedType',
      'Use a validation library like Zod for runtime type checking',
    ],
    doc_path: 'handbook/2/narrowing.html#the-unknown-type',
  },

  // TS6133: Variable is declared but never used
  6133: {
    name: 'Unused Variable',
    explanation:
      'A variable, parameter, or import is declared but never used. This often indicates dead code or a missing implementation.',
    common_causes: [
      'Variable declared but forgotten',
      'Import statement not yet used',
      'Refactoring left unused variables',
      'Parameter required by interface but not needed',
    ],
    suggested_fixes: [
      'Remove the unused variable or import',
      'Prefix with underscore to indicate intentionally unused: _unusedVar',
      'Implement the code that should use this variable',
      'Use eslint-disable comment if intentionally unused',
    ],
    doc_path: 'tsconfig#noUnusedLocals',
  },

  // TS2740: Type is missing multiple properties
  2740: {
    name: 'Multiple Properties Missing',
    explanation:
      'The object is missing multiple required properties from the target type. This usually happens when creating an object that should match a specific interface.',
    common_causes: [
      'Object literal missing many required fields',
      'Partial implementation of interface',
      'Wrong type being assigned',
      'Interface has many required properties',
    ],
    suggested_fixes: [
      'Add all missing properties to the object',
      'Use Partial<T> if properties should be optional',
      'Check if you are using the correct type',
      'Consider using a factory function to create complete objects',
    ],
    doc_path: 'handbook/utility-types.html#partialtype',
  },

  // TS2352: Type conversion error
  2352: {
    name: 'Invalid Type Conversion',
    explanation:
      "Type assertion failed because the types don't have enough overlap. TypeScript prevents conversions that are likely to be errors.",
    common_causes: [
      'Trying to convert between unrelated types',
      'Double assertion needed (value as unknown as Type)',
      'Type definitions are incorrect',
      'Runtime type differs from compile-time type',
    ],
    suggested_fixes: [
      'Use double assertion: value as unknown as TargetType',
      'Fix the underlying type issue instead of casting',
      'Add a type guard to properly narrow the type',
      'Update type definitions to reflect actual runtime types',
    ],
    doc_path: 'handbook/2/everyday-types.html#type-assertions',
  },
};

// =============================================================================
// Pattern Matchers
// =============================================================================

/**
 * Pattern matchers for extracting additional context from error messages.
 * Each pattern can provide additional suggestions based on message content.
 */
interface PatternMatcher {
  pattern: RegExp;
  additionalFixes: string[];
}

const MESSAGE_PATTERNS: PatternMatcher[] = [
  // undefined/null patterns
  {
    pattern: /undefined.*not assignable|not assignable.*undefined/i,
    additionalFixes: [
      'Add undefined to the type: Type | undefined',
      'Use optional property: prop?: Type',
      'Provide default value during destructuring: { prop = default }',
    ],
  },
  // null patterns
  {
    pattern: /null.*not assignable|not assignable.*null/i,
    additionalFixes: [
      'Add null to the type: Type | null',
      'Check for null before assignment',
      'Use ?? operator for null fallback',
    ],
  },
  // Promise patterns
  {
    pattern: /Promise|async|await/i,
    additionalFixes: [
      'Ensure async functions are awaited',
      'Add async keyword to function if using await',
      'Check Promise<T> vs T type mismatch',
    ],
  },
  // Array patterns
  {
    pattern: /\[\]|Array|readonly/i,
    additionalFixes: [
      'Check if array is readonly vs mutable',
      'Use as const for literal arrays',
      'Spread array to create mutable copy: [...readonlyArray]',
    ],
  },
  // React patterns
  {
    pattern: /React|JSX|Element|Component|Props/i,
    additionalFixes: [
      'Check component prop types',
      'Ensure children type matches',
      'Use React.FC<Props> or explicit return type',
    ],
  },
  // Event patterns
  {
    pattern: /Event|Handler|onChange|onClick/i,
    additionalFixes: [
      'Use specific event type: React.ChangeEvent<HTMLInputElement>',
      'Check event handler signature matches expected type',
      'Use generic event type if specific type unknown',
    ],
  },
];

// =============================================================================
// Handler
// =============================================================================

/**
 * Creates a success response with JSON content.
 */
function createSuccessResponse<T>(data: T): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Creates an error response.
 */
function createErrorResponse(message: string): ToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

/**
 * Get additional fix suggestions by matching error message patterns.
 *
 * @param errorMessage - The TypeScript error message
 * @returns Array of additional fix suggestions
 */
function getPatternBasedFixes(errorMessage: string): string[] {
  const additionalFixes: string[] = [];

  for (const matcher of MESSAGE_PATTERNS) {
    if (matcher.pattern.test(errorMessage)) {
      additionalFixes.push(...matcher.additionalFixes);
    }
  }

  return additionalFixes;
}

/**
 * Get context-specific suggestions based on code snippet.
 *
 * @param context - Optional code snippet where error occurred
 * @returns Array of context-specific suggestions
 */
function getContextBasedFixes(context?: string): string[] {
  if (!context) return [];

  const suggestions: string[] = [];

  // Check for common patterns in the code
  if (context.includes('async') || context.includes('await')) {
    suggestions.push('Verify async/await usage is correct');
  }

  if (context.includes('.map(') || context.includes('.filter(') || context.includes('.reduce(')) {
    suggestions.push('Add explicit type parameter to array method: arr.map<Type>(...)');
  }

  if (context.includes('useState') || context.includes('useRef')) {
    suggestions.push('Add generic type to hook: useState<Type>() or useRef<Type>()');
  }

  if (context.includes('fetch') || context.includes('axios')) {
    suggestions.push('Add type annotation to API response: const data: ResponseType = await fetch(...)');
  }

  if (context.includes('JSON.parse')) {
    suggestions.push('Validate and type parsed JSON: const data = JSON.parse(str) as ExpectedType');
  }

  return suggestions;
}

/**
 * Build the documentation URL for a TypeScript topic.
 *
 * @param docPath - The path portion of the docs URL
 * @returns Full documentation URL
 */
function buildDocUrl(docPath: string): string {
  return `https://www.typescriptlang.org/docs/${docPath}`;
}

/**
 * Get default error info for unknown error codes.
 *
 * @param errorCode - The TypeScript error code
 * @returns Default error info structure
 */
function getDefaultErrorInfo(errorCode: number): ErrorInfo {
  return {
    name: 'TypeScript Error',
    explanation: `TypeScript error TS${errorCode}. This error code is not in our database, but we can still provide general guidance based on the error message.`,
    common_causes: [
      'Type mismatch between expected and actual types',
      'Missing type annotation',
      'Incorrect type assertion',
      'Type definition issues',
    ],
    suggested_fixes: [
      'Check the error message for specific type information',
      'Review the TypeScript documentation for this error code',
      'Verify your type definitions are correct',
      'Consider using stricter type annotations',
    ],
    doc_path: 'handbook/2/everyday-types.html',
  };
}

/**
 * Handles the explain_type_error MCP tool call.
 *
 * Takes a TypeScript error code and message, then provides:
 * - Human-friendly error name and explanation
 * - Common causes for this type of error
 * - Actionable fix suggestions (combining static and pattern-matched)
 * - Link to relevant TypeScript documentation
 *
 * @param args - The explain_type_error tool arguments
 * @returns MCP tool response with error explanation
 *
 * @example
 * await handleExplainTypeError({
 *   error_code: 2322,
 *   error_message: "Type 'string | undefined' is not assignable to type 'string'.",
 *   context: "const name: string = user.name;"
 * });
 */
export async function handleExplainTypeError(args: ExplainTypeErrorArgs): Promise<ToolResponse> {
  const { error_code, error_message, context } = args;

  // Validate input
  if (typeof error_code !== 'number' || error_code < 0) {
    return createErrorResponse('error_code must be a positive integer');
  }

  if (!error_message || typeof error_message !== 'string') {
    return createErrorResponse('error_message is required and must be a string');
  }

  // Look up error in database, use default if not found
  const errorInfo = ERROR_DATABASE[error_code] ?? getDefaultErrorInfo(error_code);

  // Get additional suggestions from patterns and context
  const patternFixes = getPatternBasedFixes(error_message);
  const contextFixes = getContextBasedFixes(context);

  // Combine and deduplicate fix suggestions
  const allFixes = [...errorInfo.suggested_fixes, ...patternFixes, ...contextFixes];
  const uniqueFixes = Array.from(new Set(allFixes));

  // Build response
  const explanation: TypeErrorExplanation = {
    code: error_code,
    name: errorInfo.name,
    explanation: errorInfo.explanation,
    common_causes: errorInfo.common_causes,
    suggested_fixes: uniqueFixes,
    documentation_url: buildDocUrl(errorInfo.doc_path),
  };

  return createSuccessResponse(explanation);
}
