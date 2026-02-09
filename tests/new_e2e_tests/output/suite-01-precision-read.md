# Suite 01: precision-read - E2E Test Results

**Date**: 2026-02-09
**Total Tests**: 15
**Passed**: 13
**Failed**: 2
**Partial**: 0

| # | Test Name | Status | Notes |
|---|-----------|--------|-------|
| 01.01 | Basic content read of a single TypeScript file | PASS | Read single TypeScript file |
| 01.02 | Line range read (start: 1, end: 10) | PASS | Line range limited to 10 lines |
| 01.03 | Multi-file batch read (3 files) | PASS | Batch read 3 files |
| 01.04 | Extract outline from TypeScript file | PASS | Outline: 14 items |
| 01.05 | Extract symbols with filter (class + interface only) | PASS | Filtered: 5 symbols |
| 01.06 | Verbosity: count_only (verify minimal output) | FAIL | Should not return content in count_only |
| 01.07 | Verbosity: minimal vs standard vs verbose | PASS | Fields: min=7, std=7, verb=7 |
| 01.08 | Read with max_per_item limit | PASS | Truncated to 200 lines with pagination indicator |
| 01.09 | Large file with token_budget pagination page 1 | PASS | Page 1 returned 10001 lines |
| 01.10 | Token_budget pagination page 2 (verify different) | PASS | Page 2 differs from page 1 |
| 01.11 | Read image file - verify ImageContent | PASS | Image returned ImageContent block |
| 01.12 | Read PDF with pages parameter | FAIL | No PDF content |
| 01.13 | Read Jupyter notebook | PASS | Notebook parsed |
| 01.14 | Read empty + unicode + special chars in batch | PASS | Read 3 edge-case files |
| 01.15 | Batch read 20 files simultaneously | PASS | Batch read 20 files |
