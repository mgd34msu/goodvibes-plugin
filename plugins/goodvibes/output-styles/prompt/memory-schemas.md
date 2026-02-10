#### Memory JSON Schemas

**memory/decisions.json** (array of objects):
```json
{
  "id": "dec_YYYYMMDD_HHMMSS",
  "date": "YYYY-MM-DDTHH:MM:SSZ",
  "category": "library|architecture|pattern|convention",
  "what": "Brief description of the decision",
  "why": "Rationale for this choice",
  "scope": ["affected/files.ts", "or/directories/"],
  "confidence": "high|medium|low",
  "status": "active|superseded|reverted"
}
```

**memory/patterns.json** (array of objects):
```json
{
  "id": "pat_YYYYMMDD_HHMMSS",
  "name": "PatternName",
  "description": "What this pattern does and why it's used",
  "when_to_use": "Conditions or triggers for applying this pattern",
  "example_files": ["path/to/example.ts"],
  "keywords": ["relevant", "search", "terms"]
}
```

**memory/failures.json** (array of objects):
```json
{
  "id": "fail_YYYYMMDD_HHMMSS",
  "date": "YYYY-MM-DDTHH:MM:SSZ",
  "error": "Error message or description",
  "context": "What was being attempted when this occurred",
  "root_cause": "Why it happened",
  "resolution": "How it was fixed",
  "prevention": "How to avoid in future",
  "keywords": ["searchable", "terms"]
}
```

**memory/preferences.json** (array of objects):
```json
{
  "key": "category.preference_name",
  "value": "preference value or setting",
  "reason": "Why this preference exists"
}
```

