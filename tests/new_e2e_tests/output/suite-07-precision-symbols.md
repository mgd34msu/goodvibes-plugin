# Suite 07: precision_symbols - E2E Test Results

**Date**: 2026-02-09
**Total Tests**: 12
**Passed**: 10
**Failed**: 2
**Partial**: 0

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
| 07.01 | Workspace mode: search for "Dog" symbol | FAIL | Dog class not found |
| 07.02 | Workspace mode: search for "IAnimal" (interface) | FAIL | No symbols found |
| 07.03 | Document mode: extract all symbols from sample-classes.ts | PASS | Extracted 28 symbols (classes, interfaces, functions, etc.) |
| 07.04 | Document mode: filter by kind (class only) | PASS | Found 3 class symbols (filtered correctly) |
| 07.05 | Document mode: filter by kind (function only) on sample-functions.ts | PASS | Found 5 function symbols |
| 07.06 | Document mode: exported_only filter | PASS | Found 23 exported symbols (private symbols filtered) |
| 07.07 | Output format: names_only | PASS | Returned 28 symbol names (minimal format) |
| 07.08 | Output format: locations | PASS | Returned 28 symbols with locations |
| 07.09 | Output format: signatures | PASS | Returned 11 symbols with signatures |
| 07.10 | Output format: full (with all details) | PASS | Returned 28 symbols with full details |
| 07.11 | Python file: extract symbols from sample_classes.py | PASS | Extracted 16 Python symbols (classes, functions) |
| 07.12 | Multi-file document mode: 3 TypeScript files at once | PASS | Extracted 48 symbols from 3 files |

## Summary

✗ 2 test(s) failed


## Test Details

### Passed Tests
- **07.03**: Document mode: extract all symbols from sample-classes.ts - Extracted 28 symbols (classes, interfaces, functions, etc.)
- **07.04**: Document mode: filter by kind (class only) - Found 3 class symbols (filtered correctly)
- **07.05**: Document mode: filter by kind (function only) on sample-functions.ts - Found 5 function symbols
- **07.06**: Document mode: exported_only filter - Found 23 exported symbols (private symbols filtered)
- **07.07**: Output format: names_only - Returned 28 symbol names (minimal format)
- **07.08**: Output format: locations - Returned 28 symbols with locations
- **07.09**: Output format: signatures - Returned 11 symbols with signatures
- **07.10**: Output format: full (with all details) - Returned 28 symbols with full details
- **07.11**: Python file: extract symbols from sample_classes.py - Extracted 16 Python symbols (classes, functions)
- **07.12**: Multi-file document mode: 3 TypeScript files at once - Extracted 48 symbols from 3 files

### Failed Tests
- **07.01**: Workspace mode: search for "Dog" symbol - Dog class not found
- **07.02**: Workspace mode: search for "IAnimal" (interface) - No symbols found
