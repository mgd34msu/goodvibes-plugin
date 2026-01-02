# License Scanning Reference

License detection, compliance analysis, and policy enforcement guidance.

## License Categories

### Permissive Licenses

Allow commercial use with minimal restrictions:

| License | Commercial | Derivative Works | Attribution | Patent Grant |
|---------|------------|------------------|-------------|--------------|
| MIT | Yes | Yes | Required | No |
| Apache-2.0 | Yes | Yes | Required | Yes |
| BSD-2-Clause | Yes | Yes | Required | No |
| BSD-3-Clause | Yes | Yes | Required | No |
| ISC | Yes | Yes | Required | No |
| Unlicense | Yes | Yes | Not required | No |
| CC0-1.0 | Yes | Yes | Not required | No |

### Copyleft Licenses

Require derivative works to use same license:

| License | Strength | Commercial | Distribution Requirement |
|---------|----------|------------|-------------------------|
| GPL-2.0 | Strong | Yes | Source code |
| GPL-3.0 | Strong | Yes | Source code, patent rights |
| LGPL-2.1 | Weak | Yes | Library source only |
| LGPL-3.0 | Weak | Yes | Library source only |
| AGPL-3.0 | Network | Yes | Source for network users |
| MPL-2.0 | File-level | Yes | Modified files only |

### Proprietary/Restricted

Require explicit permission or payment:

| Category | Examples | Action |
|----------|----------|--------|
| Commercial | Proprietary SDK licenses | Check license agreement |
| Source-available | BSL, SSPL | Review restrictions |
| Creative Commons (NC/ND) | CC-BY-NC, CC-BY-ND | Not for commercial use |

## Scanning Tools

### Node.js/JavaScript

```bash
# license-checker (comprehensive)
npm install -g license-checker

# List all licenses
license-checker --json

# Check against allowed list
license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC"

# Fail on restricted licenses
license-checker --failOn "GPL;AGPL"

# Production dependencies only
license-checker --production

# Generate CSV report
license-checker --csv --out licenses.csv
```

### Python

```bash
# pip-licenses
pip install pip-licenses

# List all licenses
pip-licenses --format=json

# With package info
pip-licenses --with-urls --with-description

# Check allowed
pip-licenses --allow-only="MIT;Apache-2.0;BSD-3-Clause"

# Fail on copyleft
pip-licenses --fail-on="GPL;LGPL"
```

### Go

```bash
# go-licenses
go install github.com/google/go-licenses@latest

# Check licenses
go-licenses check ./...

# Save licenses
go-licenses save ./... --save_path=./licenses

# Report format
go-licenses report ./... 2>/dev/null
```

### Java/Maven

```xml
<!-- pom.xml -->
<plugin>
  <groupId>org.codehaus.mojo</groupId>
  <artifactId>license-maven-plugin</artifactId>
  <version>2.0.0</version>
  <executions>
    <execution>
      <id>add-third-party</id>
      <goals>
        <goal>add-third-party</goal>
      </goals>
    </execution>
  </executions>
</plugin>
```

```bash
mvn license:third-party-report
```

### Multi-Language

```bash
# FOSSA (commercial, comprehensive)
# Free for open source
fossa analyze
fossa test

# ScanCode Toolkit (open source)
pip install scancode-toolkit
scancode -clpieu --json-pp output.json src/

# Licensee (GitHub's tool)
licensee detect .
```

## Compliance Policies

### Strict Commercial Policy

For proprietary commercial software:

```json
{
  "allowed": [
    "MIT",
    "Apache-2.0",
    "BSD-2-Clause",
    "BSD-3-Clause",
    "ISC",
    "Unlicense",
    "CC0-1.0",
    "0BSD"
  ],
  "review": [
    "MPL-2.0",
    "LGPL-2.1",
    "LGPL-3.0"
  ],
  "denied": [
    "GPL-2.0",
    "GPL-3.0",
    "AGPL-3.0"
  ]
}
```

### SaaS/Cloud Policy

For network-delivered services:

```json
{
  "allowed": [
    "MIT",
    "Apache-2.0",
    "BSD-*",
    "ISC",
    "LGPL-*",
    "MPL-2.0"
  ],
  "review": [
    "GPL-2.0",
    "GPL-3.0"
  ],
  "denied": [
    "AGPL-3.0",
    "SSPL-1.0"
  ]
}
```

### Open Source Project Policy

For open source projects:

```json
{
  "allowed": [
    "MIT",
    "Apache-2.0",
    "BSD-*",
    "ISC",
    "MPL-2.0",
    "LGPL-*",
    "GPL-2.0",
    "GPL-3.0"
  ],
  "review": [
    "AGPL-3.0"
  ],
  "denied": [
    "Proprietary",
    "UNLICENSED"
  ]
}
```

## CI/CD Integration

### GitHub Actions

```yaml
name: License Check
on: [push, pull_request]

jobs:
  license-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Check licenses
        run: |
          npx license-checker \
            --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC" \
            --production
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

echo "Checking licenses..."

# Node.js
if [ -f "package.json" ]; then
  npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC" --production
  if [ $? -ne 0 ]; then
    echo "License check failed for npm packages"
    exit 1
  fi
fi

# Python
if [ -f "requirements.txt" ]; then
  pip-licenses --allow-only="MIT;Apache-2.0;BSD-3-Clause"
  if [ $? -ne 0 ]; then
    echo "License check failed for Python packages"
    exit 1
  fi
fi

echo "License check passed"
```

## SPDX License Identifiers

Standard identifiers for licenses:

```
MIT                    - MIT License
Apache-2.0             - Apache License 2.0
BSD-2-Clause           - BSD 2-Clause "Simplified" License
BSD-3-Clause           - BSD 3-Clause "New" or "Revised" License
GPL-2.0-only           - GNU General Public License v2.0 only
GPL-3.0-or-later       - GNU General Public License v3.0 or later
LGPL-2.1-only          - GNU Lesser General Public License v2.1 only
MPL-2.0                - Mozilla Public License 2.0
ISC                    - ISC License
Unlicense              - The Unlicense
CC0-1.0                - Creative Commons Zero v1.0 Universal
```

Full list: https://spdx.org/licenses/

## License Report Template

```markdown
# License Compliance Report

**Project:** {name}
**Date:** {date}
**Total Dependencies:** {count}

## Summary

| Category | Count | Status |
|----------|-------|--------|
| Permissive | {n} | Approved |
| Weak Copyleft | {n} | Review Required |
| Strong Copyleft | {n} | Denied |
| Unknown | {n} | Investigation Required |

## Approved Licenses

| Package | Version | License | Source |
|---------|---------|---------|--------|
| lodash | 4.17.21 | MIT | npm |
| axios | 1.6.0 | MIT | npm |

## Licenses Requiring Review

| Package | Version | License | Concern |
|---------|---------|---------|---------|
| some-lib | 2.0.0 | LGPL-3.0 | Copyleft terms |

## Denied Licenses

| Package | Version | License | Action |
|---------|---------|---------|--------|
| gpl-package | 1.0.0 | GPL-3.0 | Find alternative |

## Unknown/Missing Licenses

| Package | Version | Action |
|---------|---------|--------|
| unlicensed-pkg | 0.1.0 | Contact maintainer |

## Recommendations

1. Replace gpl-package with MIT-licensed alternative
2. Request license clarification for unlicensed-pkg
3. Document LGPL usage for legal review
```

## Common Issues

### Missing LICENSE file

```bash
# Find packages without license
license-checker --unknown

# Action: Check package repo for license
# Or contact maintainer
```

### License expression parsing

```bash
# Complex expressions like "(MIT OR Apache-2.0)"
# Most tools handle these automatically
# Ensure policy covers both options
```

### Private packages

```bash
# Skip private/internal packages
license-checker --excludePrivatePackages

# Or use custom policy for internal code
```
