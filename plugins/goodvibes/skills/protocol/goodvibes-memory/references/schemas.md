# GoodVibes Memory Schemas

Complete reference for all memory system JSON schemas with examples and TypeScript-style type annotations.

---

## Table of Contents

1. [decisions.json](#decisionsjson)
2. [patterns.json](#patternsjson)
3. [failures.json](#failuresjson)
4. [preferences.json](#preferencesjson)
5. [index.json](#indexjson-optional)
6. [Common Mistakes](#common-mistakes)

---

## decisions.json

### Schema

```typescript
interface Decision {
  id: string;              // Format: "dec_YYYYMMDD_HHMMSS"
  date: string;            // ISO 8601: "YYYY-MM-DDTHH:MM:SSZ"
  category: DecisionCategory;
  what: string;            // What was decided
  why: string;             // Rationale for the decision
  scope: string[];         // Files/directories affected
  confidence: "high" | "medium" | "low";
  status: "active" | "superseded" | "reverted";
}

type DecisionCategory = 
  | "library"        // Library/package selection
  | "architecture"   // System design decisions
  | "pattern"        // Code pattern choices
  | "convention";    // Project conventions and standards

type DecisionsFile = Decision[];
```

### Example Entry

```json
{
  "id": "dec_20260215_143022",
  "date": "2026-02-15T14:30:22Z",
  "category": "library",
  "what": "Use Clerk for authentication instead of NextAuth",
  "why": "Clerk provides better developer experience, built-in UI components, and simpler session management for our use case. NextAuth requires more configuration and custom UI work.",
  "scope": ["src/auth/", "src/app/", "middleware.ts"],
  "confidence": "high",
  "status": "active"
}
```

### Complete File Example

```json
[
  {
    "id": "dec_20260215_143022",
    "date": "2026-02-15T14:30:22Z",
    "category": "library",
    "what": "Use Clerk for authentication instead of NextAuth",
    "why": "Clerk provides better developer experience, built-in UI components, and simpler session management for our use case. NextAuth requires more configuration and custom UI work.",
    "scope": ["src/auth/", "src/app/", "middleware.ts"],
    "confidence": "high",
    "status": "active"
  },
  {
    "id": "dec_20260214_092015",
    "date": "2026-02-14T09:20:15Z",
    "category": "architecture",
    "what": "Use server actions instead of API routes for form submissions",
    "why": "Server actions provide better type safety, automatic revalidation, and simpler error handling compared to traditional API routes in Next.js 14+",
    "scope": ["src/app/"],
    "confidence": "medium",
    "status": "active"
  }
]
```

### Field Guidelines

- **id**: Always use timestamp format `dec_YYYYMMDD_HHMMSS`
- **date**: Use ISO 8601 UTC format with Z suffix
- **category**: Choose most specific category that applies
- **what**: Brief (1-2 sentences) description of the decision
- **why**: Detailed rationale with trade-offs considered
- **scope**: List all affected directories/files (can use glob patterns)
- **confidence**: High = proven approach, Medium = reasonable choice, Low = experimental
- **status**: Active = currently applicable, Superseded = replaced by newer decision, Reverted = decision was reversed

---

## patterns.json

### Schema

```typescript
interface Pattern {
  id: string;              // Format: "pat_YYYYMMDD_HHMMSS"
  name: string;            // PascalCase pattern name
  description: string;     // What the pattern does and why it works
  when_to_use: string;     // Situation where this pattern applies
  example_files: string[]; // Files demonstrating the pattern
  keywords: string[];      // Searchable terms
}

type PatternsFile = Pattern[];
```

### Example Entry

```json
{
  "id": "pat_20260215_143530",
  "name": "ServerActionWithZod",
  "description": "Server actions that validate input with Zod schemas and return type-safe results. Schema is defined inline, validation happens first, errors are returned as { error: string }, success returns data directly.",
  "when_to_use": "When creating server actions that handle form submissions or client mutations",
  "example_files": ["src/app/actions/user.ts", "src/app/actions/post.ts"],
  "keywords": ["server-actions", "zod", "validation", "type-safety", "forms"]
}
```

### Complete File Example

```json
[
  {
    "id": "pat_20260215_143530",
    "name": "ServerActionWithZod",
    "description": "Server actions that validate input with Zod schemas and return type-safe results. Schema is defined inline, validation happens first, errors are returned as { error: string }, success returns data directly.",
    "when_to_use": "When creating server actions that handle form submissions or client mutations",
    "example_files": ["src/app/actions/user.ts", "src/app/actions/post.ts"],
    "keywords": ["server-actions", "zod", "validation", "type-safety", "forms"]
  },
  {
    "id": "pat_20260214_102045",
    "name": "OptimisticUIUpdate",
    "description": "Use React's useOptimistic hook to update UI immediately while server action is pending, then sync with server response. Provides instant feedback and handles rollback on error.",
    "when_to_use": "When user actions should feel instant (like, favorite, follow, etc.)",
    "example_files": ["src/components/LikeButton.tsx", "src/components/FollowButton.tsx"],
    "keywords": ["optimistic-ui", "useOptimistic", "react", "ux", "instant-feedback"]
  }
]
```

### Field Guidelines

- **id**: Always use timestamp format `pat_YYYYMMDD_HHMMSS`
- **name**: Use PascalCase, descriptive, avoid abbreviations
- **description**: Technical explanation of the pattern and its benefits
- **when_to_use**: Specific trigger conditions or use cases
- **example_files**: Actual files in the project demonstrating the pattern
- **keywords**: Include technology names, concepts, and searchable terms

---

## failures.json

### Schema

```typescript
interface Failure {
  id: string;              // Format: "fail_YYYYMMDD_HHMMSS"
  date: string;            // ISO 8601: "YYYY-MM-DDTHH:MM:SSZ"
  error: string;           // Brief error description
  context: string;         // What task was being performed
  root_cause: string;      // Technical explanation of why it failed
  resolution: string;      // How it was fixed (or "UNRESOLVED")
  prevention: string;      // How to avoid this failure in the future
  keywords: string[];      // Searchable error-related terms
}

type FailuresFile = Failure[];
```

### Example Entry

```json
{
  "id": "fail_20260215_144015",
  "date": "2026-02-15T14:40:15Z",
  "error": "Next.js build failed with 'Module not found: clerk/nextjs'",
  "context": "Implementing Clerk authentication in Next.js 14 app",
  "root_cause": "Imported from '@clerk/nextjs' but package.json has '@clerk/nextjs/server'. The /server subpath export is for server-only imports, not the main package.",
  "resolution": "RESOLVED - Changed import to '@clerk/nextjs/server' for server components and '@clerk/nextjs' for client components. Both exports exist in the same package.",
  "prevention": "Check package.json exports field before importing. Clerk has separate exports for server vs client usage. Use '@clerk/nextjs' for client, '@clerk/nextjs/server' for server.",
  "keywords": ["clerk", "nextjs", "module-not-found", "imports", "build-error", "subpath-exports"]
}
```

### Complete File Example

```json
[
  {
    "id": "fail_20260215_144015",
    "date": "2026-02-15T14:40:15Z",
    "error": "Next.js build failed with 'Module not found: clerk/nextjs'",
    "context": "Implementing Clerk authentication in Next.js 14 app",
    "root_cause": "Imported from '@clerk/nextjs' but package.json has '@clerk/nextjs/server'. The /server subpath export is for server-only imports, not the main package.",
    "resolution": "RESOLVED - Changed import to '@clerk/nextjs/server' for server components and '@clerk/nextjs' for client components. Both exports exist in the same package.",
    "prevention": "Check package.json exports field before importing. Clerk has separate exports for server vs client usage. Use '@clerk/nextjs' for client, '@clerk/nextjs/server' for server.",
    "keywords": ["clerk", "nextjs", "module-not-found", "imports", "build-error", "subpath-exports"]
  },
  {
    "id": "fail_20260214_163420",
    "date": "2026-02-14T16:34:20Z",
    "error": "TypeScript error: 'useFormStatus' is not a function",
    "context": "Creating form submit button with pending state",
    "root_cause": "Imported useFormStatus from 'react' instead of 'react-dom'. useFormStatus is a React DOM hook, not a core React hook.",
    "resolution": "RESOLVED - Changed import to 'react-dom'",
    "prevention": "Form-related hooks (useFormStatus, useFormState) are in 'react-dom', not 'react'. Check React docs for hook location.",
    "keywords": ["react", "react-dom", "useFormStatus", "imports", "typescript", "hooks"]
  }
]
```

### Field Guidelines

- **id**: Always use timestamp format `fail_YYYYMMDD_HHMMSS`
- **date**: Use ISO 8601 UTC format with Z suffix
- **error**: Brief, searchable description (what failed)
- **context**: What were you trying to do when it failed
- **root_cause**: Technical explanation (why it failed)
- **resolution**: How it was fixed, or "UNRESOLVED" if not fixed
- **prevention**: Actionable advice to avoid this in the future
- **keywords**: Error messages, technology names, concepts (for searching)

---

## preferences.json

### Schema

```typescript
interface Preference {
  key: string;    // Preference identifier (category.preference_name)
  value: any;     // Preference value or setting
  reason: string; // Why this preference exists
}

type PreferencesFile = Preference[];
```

### Example Entry

```json
{
  "key": "naming.component-files",
  "value": "PascalCase with .tsx extension",
  "reason": "Standard React convention for component files"
}
```

### Complete File Example

```json
[
  {
    "key": "import.order",
    "value": ["react", "next", "external", "internal", "relative"],
    "reason": "Consistent import ordering improves readability and reduces merge conflicts"
  },
  {
    "key": "naming.component-files",
    "value": "PascalCase with .tsx extension",
    "reason": "Standard React convention for component files"
  },
  {
    "key": "testing.location",
    "value": "colocated with source files",
    "reason": "Easier to maintain tests when they're next to the code they test"
  }
]
```

### Field Guidelines

- **key**: Use dot notation for categorization (e.g., "category.preference_name")
- **value**: Can be string, number, boolean, object, or array
- **reason**: Explanation for why this preference exists

---

## index.json (Optional)

### Schema

```typescript
interface MemoryIndex {
  version: string;         // Memory system version
  last_updated: string;    // ISO 8601 timestamp
  stats: {
    decisions: number;
    patterns: number;
    failures: number;
    preferences: number;
  };
  tags: string[];          // All unique tags across memory
  categories: string[];    // All unique categories
}
```

### Example

```json
{
  "version": "1.0.0",
  "last_updated": "2026-02-15T15:30:00Z",
  "stats": {
    "decisions": 12,
    "patterns": 8,
    "failures": 15,
    "preferences": 6
  },
  "tags": [
    "auth",
    "clerk",
    "nextjs",
    "server-actions",
    "zod",
    "validation",
    "typescript",
    "build-error"
  ],
  "categories": [
    "architecture",
    "library",
    "pattern",
    "convention"
  ]
}
```

### Purpose

The index file is optional and provides quick statistics and searchable tags. It's NOT required for the memory system to function -- it's a convenience for human readers.

---

## Common Mistakes

### Wrong ID Format

[FAIL] **Wrong**:
```json
{
  "id": "decision-1",
  "id": "dec-2026-02-15",
  "id": "dec_202602151430"
}
```

[PASS] **Correct**:
```json
{
  "id": "dec_20260215_143022"
}
```

### Missing Required Fields

[FAIL] **Wrong**:
```json
{
  "id": "fail_20260215_143022",
  "error": "Build failed",
  "resolution": "Fixed it"
}
```

[PASS] **Correct**:
```json
{
  "id": "fail_20260215_143022",
  "date": "2026-02-15T14:30:22Z",
  "error": "Build failed",
  "context": "Running npm run build",
  "root_cause": "TypeScript compilation error",
  "resolution": "Fixed type annotations",
  "prevention": "Run typecheck before build",
  "keywords": ["build", "typescript"]
}
```

### Stale Status

[FAIL] **Wrong**: Decision marked as "active" but actually superseded by newer decision

[PASS] **Correct**: Update old decision status to "superseded" when creating new decision

### Missing Prevention

[FAIL] **Wrong**:
```json
{
  "resolution": "RESOLVED - Installed missing package"
}
```

[PASS] **Correct**:
```json
{
  "resolution": "RESOLVED - Installed missing package",
  "prevention": "Check package.json before importing. Use precision_read to verify dependencies exist."
}
```

### Vague Keywords

[FAIL] **Wrong**:
```json
{
  "keywords": ["error", "bug", "fix"]
}
```

[PASS] **Correct**:
```json
{
  "keywords": ["clerk", "authentication", "module-not-found", "nextjs", "subpath-exports"]
}
```

### Wrong ISO 8601 Format

[FAIL] **Wrong**:
```json
{
  "date": "2026-02-15",
  "date": "2026-02-15 14:30:22",
  "date": "02/15/2026"
}
```

[PASS] **Correct**:
```json
{
  "date": "2026-02-15T14:30:22Z"
}
```

---

## Validation Checklist

### decisions.json

- [ ] All entries have unique timestamp-based IDs
- [ ] All dates are ISO 8601 with Z suffix
- [ ] Category is one of the allowed values
- [ ] Scope is an array (not a string)
- [ ] Confidence is "high", "medium", or "low"
- [ ] Status is "active", "superseded", or "reverted"

### patterns.json

- [ ] All entries have unique timestamp-based IDs
- [ ] Names are PascalCase
- [ ] Description explains what and why
- [ ] when_to_use is specific and actionable
- [ ] example_files are real files in the project
- [ ] Keywords are searchable and specific

### failures.json

- [ ] All entries have unique timestamp-based IDs
- [ ] All dates are ISO 8601 with Z suffix
- [ ] Error is brief and searchable
- [ ] Context describes the task being performed
- [ ] Root cause explains why it failed
- [ ] Resolution describes how it was fixed
- [ ] Prevention provides actionable advice
- [ ] Keywords include error messages and tech terms

### preferences.json

- [ ] All entries have key, value, and reason fields
- [ ] Keys use dot notation (category.preference_name)
- [ ] Value can be any type (string, object, array, etc.)
- [ ] Reason provides clear explanation

---

## TypeScript Type Definitions

For projects using TypeScript, these types can be used for type-safe memory operations:

```typescript
// types/memory.ts

export interface Decision {
  id: string;
  date: string;
  category: "library" | "architecture" | "pattern" | "convention";
  what: string;
  why: string;
  scope: string[];
  confidence: "high" | "medium" | "low";
  status: "active" | "superseded" | "reverted";
}

export interface Pattern {
  id: string;
  name: string;
  description: string;
  when_to_use: string;
  example_files: string[];
  keywords: string[];
}

export interface Failure {
  id: string;
  date: string;
  error: string;
  context: string;
  root_cause: string;
  resolution: string;
  prevention: string;
  keywords: string[];
}

export interface Preference {
  key: string;    // Preference identifier (category.preference_name)
  value: any;     // Preference value or setting
  reason: string; // Why this preference exists
}

export interface MemoryIndex {
  version: string;
  last_updated: string;
  stats: {
    decisions: number;
    patterns: number;
    failures: number;
    preferences: number;
  };
  tags: string[];
  categories: string[];
}
```

---

## JSON Schema Validation

For automated validation, here are JSON Schema definitions:

### Decision Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "date", "category", "what", "why", "scope", "confidence", "status"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^dec_[0-9]{8}_[0-9]{6}$"
      },
      "date": {
        "type": "string",
        "format": "date-time"
      },
      "category": {
        "type": "string",
        "enum": ["library", "architecture", "pattern", "convention"]
      },
      "what": { "type": "string" },
      "why": { "type": "string" },
      "scope": {
        "type": "array",
        "items": { "type": "string" }
      },
      "confidence": {
        "type": "string",
        "enum": ["high", "medium", "low"]
      },
      "status": {
        "type": "string",
        "enum": ["active", "superseded", "reverted"]
      }
    }
  }
}
```

### Pattern Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "name", "description", "when_to_use", "example_files", "keywords"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^pat_[0-9]{8}_[0-9]{6}$"
      },
      "name": { "type": "string" },
      "description": { "type": "string" },
      "when_to_use": { "type": "string" },
      "example_files": {
        "type": "array",
        "items": { "type": "string" }
      },
      "keywords": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

### Failure Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["id", "date", "error", "context", "root_cause", "resolution", "prevention", "keywords"],
    "properties": {
      "id": {
        "type": "string",
        "pattern": "^fail_[0-9]{8}_[0-9]{6}$"
      },
      "date": {
        "type": "string",
        "format": "date-time"
      },
      "error": { "type": "string" },
      "context": { "type": "string" },
      "root_cause": { "type": "string" },
      "resolution": { "type": "string" },
      "prevention": { "type": "string" },
      "keywords": {
        "type": "array",
        "items": { "type": "string" }
      }
    }
  }
}
```

### Preference Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "array",
  "items": {
    "type": "object",
    "required": ["key", "value", "reason"],
    "properties": {
      "key": {
        "type": "string",
        "pattern": "^[a-z]+\\.[a-z-]+$"
      },
      "value": {},
      "reason": { "type": "string" }
    }
  }
}
```

---

For more information, see the main SKILL.md file.
