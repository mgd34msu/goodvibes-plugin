# Chromatic Configuration Reference

## CLI Options

```bash
chromatic [options]
```

### Authentication

| Option | Description |
|--------|-------------|
| `--project-token` | Project token from chromatic.com |
| `--app-code` | Deprecated, use --project-token |

### Build Options

| Option | Description |
|--------|-------------|
| `--build-script-name` | npm script to build Storybook (default: build-storybook) |
| `--storybook-build-dir` | Pre-built Storybook directory |
| `--output-dir` | Output directory for Storybook build |
| `--storybook-base-dir` | Relative path from root to Storybook config |

### Testing Behavior

| Option | Description |
|--------|-------------|
| `--only-changed` | Only test stories affected by Git changes |
| `--only-story-files` | Only test stories matching glob pattern |
| `--only-story-names` | Only test stories matching name pattern |
| `--skip` | Skip build for branches matching pattern |
| `--externals` | Glob patterns for external files affecting stories |
| `--untraced` | Glob patterns to ignore when detecting changes |
| `--trace-changed` | Trace dependency changes (true/expanded) |

### Acceptance

| Option | Description |
|--------|-------------|
| `--auto-accept-changes` | Auto-accept on matching branches |
| `--exit-zero-on-changes` | Exit 0 even when changes detected |
| `--exit-once-uploaded` | Exit after upload, don't wait for results |
| `--ignore-last-build-on-branch` | Ignore previous build on branch |

### Performance

| Option | Description |
|--------|-------------|
| `--zip` | Compress Storybook files before upload |
| `--preserve-missing` | Treat missing stories as unchanged |
| `--parallel` | Run builds in parallel |

## chromatic.config.json

```json
{
  "projectToken": "chpt_xxxxxxxxxxxx",

  "buildScriptName": "build-storybook",
  "storybookBuildDir": "storybook-static",
  "storybookBaseDir": "",

  "onlyChanged": true,
  "traceChanged": "expanded",
  "externals": ["public/**"],
  "untraced": ["**/*.md"],

  "autoAcceptChanges": "main",
  "exitZeroOnChanges": false,
  "exitOnceUploaded": false,

  "skip": "dependabot/**",
  "zip": true,
  "junitReport": true
}
```

## Story Parameters

### chromatic Parameter Options

```tsx
parameters: {
  chromatic: {
    // Disable snapshot for this story
    disableSnapshot: boolean,

    // Viewport widths to capture
    viewports: number[],

    // Delay before snapshot (ms)
    delay: number,

    // Pause CSS animations at end
    pauseAnimationAtEnd: boolean,

    // Diff threshold (0-1)
    diffThreshold: number,

    // Include anti-aliasing in diff
    diffIncludeAntiAliasing: boolean,

    // Browser modes
    modes: {
      [name: string]: {
        viewport?: number | { width: number, height: number },
        theme?: string,
        locale?: string
      }
    }
  }
}
```

## Environment Variables

```bash
# Project token
CHROMATIC_PROJECT_TOKEN=chpt_xxxxxxxxxxxx

# CI environment
CI=true
CHROMATIC_SHA=<commit-sha>
CHROMATIC_BRANCH=<branch-name>

# Debug
LOG_LEVEL=debug
CHROMATIC_DNS_SERVERS=8.8.8.8,8.8.4.4
```

## Browser Support

Chromatic captures snapshots in:
- Chrome (default)
- Firefox
- Safari
- Edge

Configure per-story:

```tsx
parameters: {
  chromatic: {
    modes: {
      chrome: {},
      firefox: {},
      safari: {},
      edge: {}
    }
  }
}
```

## Snapshot Modes

### Responsive Testing

```tsx
// Multiple viewports
chromatic: {
  viewports: [320, 768, 1024, 1440]
}
```

### Theme Testing

```tsx
// Test light and dark themes
chromatic: {
  modes: {
    light: { theme: 'light' },
    dark: { theme: 'dark' }
  }
}
```

### Locale Testing

```tsx
// Test multiple locales
chromatic: {
  modes: {
    en: { locale: 'en-US' },
    de: { locale: 'de-DE' },
    ja: { locale: 'ja-JP' }
  }
}
```

## JUnit Reports

```bash
npx chromatic --junit-report
```

Output: `chromatic-build-{number}.xml`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Chromatic" tests="50" failures="2">
    <testcase name="Button--Primary" classname="Components/Button">
      <failure>Visual changes detected</failure>
    </testcase>
  </testsuite>
</testsuites>
```
