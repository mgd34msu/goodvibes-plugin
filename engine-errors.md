# Engine Tool Errors

Errors encountered during testing of precision, batch, and registry engine tools.

## Parameter Errors (User Fixable)

These errors are due to incorrect parameter usage. The JSON parsing works fine.

### precision_symbols

**Error:**
```
Missing required parameter 'mode'. Expected: workspace or document.
Missing required parameter 'output'. Expected: output configuration object.
```

**Fix:**
```json
{
  "mode": "document",
  "files": ["src/index.ts"],
  "output": { "mode": "signatures" }
}
```

---

### discover

**Error:**
```
Missing required parameter 'queries'. Expected: array of query objects.
```

**Fix:**
```json
{
  "queries": [
    { "id": "find_files", "type": "glob", "patterns": ["**/*.ts"] }
  ]
}
```

---

### get_agent_content

**Error:**
```
The "path" argument must be of type string. Received undefined
```

**Cause:** Used `name` instead of `path` parameter.

**Fix:**
```json
{
  "path": "engineer"
}
```

---

### batch_state

**Error:**
```
operation is required
```

**Fix:**
```json
{
  "operation": "get"
}
```

---

### precision_exec

**Error:**
```
Missing required parameter 'commands'. Expected: array of command objects.
```

**Cause:** Used `command` (singular) instead of `commands` (array).

**Fix:**
```json
{
  "commands": [
    { "cmd": "echo hello" }
  ]
}
```

---

## Internal Tool Bugs (Code Fix Required)

These are bugs in the tool implementations themselves, not user errors.

### recommend_skills (registry-engine)

**Error:**
```
Cannot read properties of undefined (reading 'toLowerCase')
```

**Location:** `plugins/goodvibes/tools/implementations/registry-engine/`

**Cause:** The tool is calling `.toLowerCase()` on an undefined value, likely when processing the `context` parameter.

**Fix:** Add null check before calling `.toLowerCase()`:
```typescript
// Before
const normalized = value.toLowerCase();

// After
const normalized = value?.toLowerCase() ?? '';
```

---

### skill_dependencies (registry-engine)

**Error:**
```
Cannot read properties of undefined (reading '$and')
```

**Location:** `plugins/goodvibes/tools/implementations/registry-engine/`

**Cause:** The tool is trying to access `$and` on an undefined query object, likely in a database or search query builder.

**Fix:** Ensure the query object is initialized before accessing properties:
```typescript
// Before
const results = query.$and;

// After
const results = query?.$and ?? [];
```

---

## Summary

| Tool | Error Type | Status |
|------|------------|--------|
| precision_symbols | Parameter | User fixable |
| discover | Parameter | User fixable |
| get_agent_content | Parameter | User fixable |
| batch_state | Parameter | User fixable |
| precision_exec | Parameter | User fixable |
| recommend_skills | Internal bug | Needs code fix |
| skill_dependencies | Internal bug | Needs code fix |
