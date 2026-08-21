# intel measurement harness

The harness behind every token-savings number in the READMEs. It measures the two
intel operations that claim to beat a native tool, and it is runnable on demand
rather than wired into CI, so any claim can be reproduced before it is quoted.

The rule the numbers serve: if intel stops beating native on these operations at
default settings, the claim comes out of the README rather than being restated
with a softer verb.

## What it measures

| Script | Operation | Native baseline |
|---|---|---|
| `measure-outline.mjs` | `code_read`'s `outline` extract against three real source files | a full native read of the same file |
| `measure-grep.mjs` | `code_grep`'s `files_only` output | `git grep -n` for the same pattern and path |

Both compare a real tool response against a real baseline on the same input. The
grep script also checks ground truth, asserting that both sides found the same
number of matches, so a token saving can never come from silently returning
fewer results.

The harness is scoped to operations that survived into v2. Earlier measurements
covered `content`, `symbols`, and `ast` extract modes that v2 does not ship,
and those do not port, because there is nothing left to measure them against.

## Prerequisites

```sh
node packages/intel/build.mjs   # produces plugins/goodvibes/server/intel/index.cjs
```

`measure-grep.mjs` also needs `git` on PATH, since `git grep -n` is the baseline
it compares against. Both scripts need the ripgrep binary the server resolves
(`@vscode/ripgrep` once installed, or a system `rg` on PATH meanwhile; see
`src/lib/ripgrep.ts`).

## Run

```sh
node packages/intel/bench/run-all.mjs

# or individually, with custom targets:
node packages/intel/bench/measure-outline.mjs packages/intel/src/tools/code_grep.ts
node packages/intel/bench/measure-grep.mjs 'export function' packages/intel/src
```

## Exit codes

| Code | Meaning |
|---|---|
| `0` | PASS. The intel tool beat the native baseline on every file measured |
| `1` | FAIL. The tool did not beat the baseline, or the grep match counts disagreed |
| `2` | `measure-outline.mjs` only. Outline extraction itself errored, so nothing was measured |

Exit `2` is deliberately distinct from a FAIL. It means the environment could not
run the measurement, typically a tree-sitter grammar or `web-tree-sitter` asset
problem, and that is an environment or toolchain blocker rather than a result
about the tool. Treating it as a FAIL would retire a claim that was never tested.
`src/__tests__/test-utils.ts` exposes the same probe as
`treeSitterOutlineAvailable`.

## Method

Token counts use the same `bytes / 3.5` estimate as `@goodvibes/core/envelope`,
applied uniformly to the native baseline and the intel response so the
comparison is like for like. The deep review that first grounded these claims
used the same estimator; see
[`docs/history/deep-review-2026-07-01.md`](../../../docs/history/deep-review-2026-07-01.md)
Appendix A.
