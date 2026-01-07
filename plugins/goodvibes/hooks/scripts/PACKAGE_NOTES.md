# Package Configuration Notes

## esbuild Override (package.json:17-19)

The `esbuild` package is pinned to version `0.27.2` for compatibility with `vitest 2.1.0`.

**Why**: Newer versions of esbuild (0.28.x and above) introduced breaking changes that cause test runner failures in vitest 2.1.0. Specifically:

- Changes to the module resolution algorithm
- Modified handling of TypeScript imports with `.js` extensions
- ESM/CJS interop changes

**When to update**: This override can be removed when:

- Vitest is upgraded to a version that supports newer esbuild versions
- The build configuration is updated to handle the new esbuild behavior
- All 426 tests pass without the override

**Testing**: After removing this override, run `npm test` to verify all tests still pass.
