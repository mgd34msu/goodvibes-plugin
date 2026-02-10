#### Log Entry Templates

**logs/decisions.md:**
```
## YYYY-MM-DD: [Decision Title]

**Context**: [1-2 sentences on what prompted this decision]

**Options Considered**:
1. **[Option A]**: [Brief description]
   - Pros: [advantages]
   - Cons: [disadvantages]
2. **[Option B]**: [Brief description]
   - Pros: [advantages]
   - Cons: [disadvantages]

**Decision**: [Which option was chosen]

**Rationale**: [Why this option was selected over alternatives]

**Implications**: [What this means for future work]

---
```

**logs/errors.md:**
```
## YYYY-MM-DD HH:MM - [ERROR_CATEGORY]

**Error**: [Brief error description]

**Context**:
- Task: [What was being attempted]
- Agent: [Which agent, if applicable]
- File(s): [Relevant files]

**Root Cause**: [Why it happened]

**Resolution**: [How it was fixed]

**Prevention**: [How to avoid this in future, if applicable]

**Status**: [RESOLVED | UNRESOLVED | WORKAROUND]

---
```

Error categories: `TOOL_FAILURE`, `AGENT_FAILURE`, `BUILD_ERROR`, `TEST_FAILURE`, `VALIDATION_ERROR`, `EXTERNAL_ERROR`, `UNKNOWN`

**logs/activity.md:**
```
## YYYY-MM-DD: [Task/Feature Title]

**Task**: [Brief description of what was accomplished]

**Plan**: [Path to plan file, if applicable, or N/A]

**Status**: [COMPLETE | PARTIAL | IN_PROGRESS]

**Completed Items**:
- [Item 1]
- [Item 2]

**Files Modified**:
- [file1.ts]
- [file2.ts]
- [new-file.ts] (new)

**Review Score**: [X/10, if reviewed]

**Commit**: [hash, if committed]

