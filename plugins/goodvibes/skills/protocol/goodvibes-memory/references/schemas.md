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
  status: "active" | "deprecated" | "superseded";
}

type DecisionCategory = 
  | "architecture"   // System design decisions
  | "pattern"        // Code pattern choices
  | "library"        // Library/package selection
  | "tool"           // Tool/framework choice
  | "process"        // Development process decisions
  | "style";         // Code style decisions

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
- **status**: Active = currently applicable, Deprecated = outdated, Superseded = replaced by newer decision

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
  id: string;              // Format: "pref_YYYYMMDD_HHMMSS"
  timestamp: string;       // ISO 8601: "YYYY-MM-DDTHH:MM:SSZ"
  key: string;             // Preference identifier (kebab-case)
  value: any;              // Preference value (string, object, array, etc.)
  source: "user" | "team" | "project" | "inferred";
  scope: "global" | "session" | string; // Scope of preference
  reason?: string;         // Optional: why this preference exists
}

interface PreferencesFile {
  preferences: Preference[];
  last_updated: string;    // ISO 8601 timestamp
}
```

### Example Entry

```json
{
  "id": "pref_20260215_150000",
  "timestamp": "2026-02-15T15:00:00Z",
  "key": "import-order",
  "value": {
    "order": ["react", "next", "external", "internal", "relative"],
    "separator": true
  },
  "source": "team",
  "scope": "global",
  "reason": "Consistent import ordering improves readability and reduces merge conflicts"
}
```

### Complete File Example

```json
{
  "preferences": [
    {
      "id": "pref_20260215_150000",
      "timestamp": "2026-02-15T15:00:00Z",
      "key": "import-order",
      "value": {
        "order": ["react", "next", "external", "internal", "relative"],
        "separator": true
      },
      "source": "team",
      "scope": "global",
      "reason": "Consistent import ordering improves readability and reduces merge conflicts"
    },
    {
      "id": "pref_20260215_150100",
      "timestamp": "2026-02-15T15:01:00Z",
      "key": "component-naming",
      "value": "PascalCase with .tsx extension",
      "source": "team",
      "scope": "global",
      "reason": "Standard React convention"
    },
    {
      "id": "pref_20260215_150200",
      "timestamp": "2026-02-15T15:02:00Z",
      "key": "test-location",
      "value": "colocated with source files",
      "source": "team",
      "scope": "global",
      "reason": "Easier to maintain tests when they're next to the code they test"
    }
  ],
  "last_updated": "2026-02-15T15:02:00Z"
}
```

### Field Guidelines

- **id**: Always use timestamp format `pref_YYYYMMDD_HHMMSS`
- **timestamp**: Use ISO 8601 UTC format with Z suffix
- **key**: Use kebab-case, descriptive identifier
- **value**: Can be string, number, boolean, object, or array
- **source**: Who/what established this preference
- **scope**: "global" = project-wide, "session" = temporary, or specific path/domain
- **reason**: Optional but recommended for team preferences

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
    "tool"
  ]
}
```

### Purpose

The index file is optional and provides quick statistics and searchable tags. It's NOT required for the memory system to function — it's a convenience for human readers.

---

## Common Mistakes

### Wrong ID Format

❌ **Wrong**:
```json
{
  "id": "decision-1",
  "id": "dec-2026-02-15",
  "id": "dec_202602151430"
}
```

✅ **Correct**:
```json
{
  "id": "dec_20260215_143022"
}
```

### Missing Required Fields

❌ **Wrong**:
```json
{
  "id": "fail_20260215_143022",
  "error": "Build failed",
  "resolution": "Fixed it"
}
```

✅ **Correct**:
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

❌ **Wrong**: Decision marked as "active" but actually superseded by newer decision

✅ **Correct**: Update old decision status to "superseded" when creating new decision

### Missing Prevention

❌ **Wrong**:
```json
{
  "resolution": "RESOLVED - Installed missing package"
}
```

✅ **Correct**:
```json
{
  "resolution": "RESOLVED - Installed missing package",
  "prevention": "Check package.json before importing. Use precision_read to verify dependencies exist."
}
```

### Vague Keywords

❌ **Wrong**:
```json
{
  "keywords": ["error", "bug", "fix"]
}
```

✅ **Correct**:
```json
{
  "keywords": ["clerk", "authentication", "module-not-found", "nextjs", "subpath-exports"]
}
```

### Wrong ISO 8601 Format

❌ **Wrong**:
```json
{
  "date": "2026-02-15",
  "date": "2026-02-15 14:30:22",
  "date": "02/15/2026"
}
```

✅ **Correct**:
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
- [ ] Status is "active", "deprecated", or "superseded"

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

- [ ] All entries have unique timestamp-based IDs
- [ ] All timestamps are ISO 8601 with Z suffix
- [ ] Keys are kebab-case
- [ ] Source is valid ("user", "team", "project", "inferred")
- [ ] File has last_updated timestamp
- [ ] Preferences array is not empty

---

## TypeScript Type Definitions

For projects using TypeScript, these types can be used for type-safe memory operations:

```typescript
// types/memory.ts

export interface Decision {
  id: string;
  date: string;
  category: "architecture" | "pattern" | "library" | "tool" | "process" | "style";
  what: string;
  why: string;
  scope: string[];
  confidence: "high" | "medium" | "low";
  status: "active" | "deprecated" | "superseded";
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
  id: string;
  timestamp: string;
  key: string;
  value: any;
  source: "user" | "team" | "project" | "inferred";
  scope: string;
  reason?: string;
}

export interface PreferencesFile {
  preferences: Preference[];
  last_updated: string;
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
        "enum": ["architecture", "pattern", "library", "tool", "process", "style"]
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
        "enum": ["active", "deprecated", "superseded"]
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

---

For more information, see the main SKILL.md file.
