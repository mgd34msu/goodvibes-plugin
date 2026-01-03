# Security Auditing Reference

Comprehensive guide for dependency security scanning, vulnerability remediation, and license compliance.

## Security Scanning Tools

### Node.js / npm

```bash
# Built-in audit
npm audit
npm audit --json             # Machine-readable
npm audit --audit-level=high # Only show high+

# Fix automatically
npm audit fix                # Safe fixes only
npm audit fix --force        # Force major updates (risky!)

# Dry run
npm audit fix --dry-run

# Production only
npm audit --omit=dev
```

### Snyk

```bash
# Install
npm install -g snyk

# Authenticate
snyk auth

# Test project
snyk test

# Monitor continuously
snyk monitor

# Fix vulnerabilities
snyk wizard

# Test specific package
snyk test npm:lodash

# Ignore vulnerability
snyk ignore --id=SNYK-JS-LODASH-1234
```

### OWASP Dependency-Check

```bash
# Install (via Homebrew)
brew install dependency-check

# Run scan
dependency-check --project "My App" --scan ./

# Output formats
dependency-check --format HTML --format JSON -o reports/
```

### OSV-Scanner (Google)

```bash
# Install
go install github.com/google/osv-scanner/cmd/osv-scanner@latest

# Scan
osv-scanner --lockfile package-lock.json

# Recursive scan
osv-scanner -r /path/to/project
```

---

## Language-Specific Scanning

### Python

```bash
# pip-audit
pip install pip-audit
pip-audit

# Safety (commercial)
pip install safety
safety check

# From requirements file
pip-audit -r requirements.txt
safety check -r requirements.txt
```

### Go

```bash
# govulncheck (official)
go install golang.org/x/vuln/cmd/govulncheck@latest
govulncheck ./...

# Nancy (Sonatype)
go list -json -deps ./... | nancy sleuth
```

### Rust

```bash
# cargo-audit
cargo install cargo-audit
cargo audit

# With fix suggestions
cargo audit fix --dry-run
```

### Ruby

```bash
# bundler-audit
gem install bundler-audit
bundle-audit check

# Update vulnerability database
bundle-audit update
```

---

## Vulnerability Database Sources

| Database | Coverage | URL |
|----------|----------|-----|
| NVD (NIST) | All languages | nvd.nist.gov |
| GitHub Advisory | All | github.com/advisories |
| Snyk Vulnerability DB | All | security.snyk.io |
| OSV (Google) | All | osv.dev |
| npm Audit | Node.js | npmjs.com |
| PyPI Advisory | Python | pypi.org/security |
| RustSec | Rust | rustsec.org |

---

## Severity Levels and Response

### CVSS Scoring

| Score | Severity | Response Time |
|-------|----------|---------------|
| 9.0-10.0 | Critical | Immediate (same day) |
| 7.0-8.9 | High | Within 1 week |
| 4.0-6.9 | Medium | Within 1 month |
| 0.1-3.9 | Low | Quarterly review |

### Triage Process

```markdown
## Vulnerability Triage Checklist

### 1. Assess Impact
- [ ] Is this a direct or transitive dependency?
- [ ] Is the vulnerable code path actually used?
- [ ] What's the attack vector? (network, local, etc.)
- [ ] What data is at risk?

### 2. Check Exploitability
- [ ] Is there a known exploit?
- [ ] Is it being actively exploited?
- [ ] Does our usage expose the vulnerability?

### 3. Evaluate Fix Options
- [ ] Is a patched version available?
- [ ] Can we upgrade without breaking changes?
- [ ] Is there a workaround?
- [ ] Can we remove the dependency?

### 4. Document Decision
- [ ] Record decision in security log
- [ ] Set follow-up date if deferring
- [ ] Create tracking issue if needed
```

---

## Remediation Strategies

### Strategy 1: Direct Upgrade

```bash
# Check available versions
npm view <package> versions

# Upgrade to patched version
npm install <package>@<safe-version>

# Verify fix
npm audit
```

### Strategy 2: Transitive Dependency Override

```json
// package.json (npm 8.3+)
{
  "overrides": {
    "vulnerable-package": "^2.0.0"
  }
}

// yarn
{
  "resolutions": {
    "**/vulnerable-package": "^2.0.0"
  }
}

// pnpm
{
  "pnpm": {
    "overrides": {
      "vulnerable-package": "^2.0.0"
    }
  }
}
```

### Strategy 3: Replace Dependency

```bash
# Find what depends on vulnerable package
npm ls vulnerable-package

# Find alternative packages
npx npms-cli search alternative-to-vulnerable

# Replace
npm uninstall old-package
npm install new-alternative
```

### Strategy 4: Vendor and Patch

```bash
# Fork the vulnerable package
# Apply security patch
# Reference forked version

{
  "dependencies": {
    "vulnerable-package": "github:your-org/patched-package#v1.0.0-patched"
  }
}
```

### Strategy 5: Accept Risk (Documented)

```json
// .snyk file
{
  "ignore": {
    "SNYK-JS-LODASH-1234": {
      "expires": "2024-06-01",
      "reason": "Not exploitable in our usage"
    }
  }
}
```

```json
// npm audit resolve
// package.json
{
  "auditConfig": {
    "ignore": [
      "CVE-2024-1234"
    ]
  }
}
```

---

## License Compliance

### Scanning Tools

```bash
# Node.js
npx license-checker
npx license-checker --summary
npx license-checker --json > licenses.json

# With allow/deny lists
npx license-checker --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC"
npx license-checker --failOn "GPL;AGPL"

# Python
pip install pip-licenses
pip-licenses
pip-licenses --format=markdown

# Go
go install github.com/google/go-licenses@latest
go-licenses csv ./...
go-licenses check ./...

# Rust
cargo install cargo-license
cargo license
```

### License Categories

#### Permissive (Low Risk)
```
MIT          - Very permissive, minimal requirements
Apache-2.0   - Permissive, includes patent grant
BSD-2-Clause - Permissive, minimal attribution
BSD-3-Clause - Permissive, no endorsement clause
ISC          - Permissive, simplified BSD
Unlicense    - Public domain dedication
CC0-1.0      - Public domain dedication
```

#### Weak Copyleft (Medium Risk)
```
LGPL-2.1     - Copyleft for library modifications
LGPL-3.0     - Copyleft for library modifications
MPL-2.0      - File-level copyleft
EPL-1.0      - Weak copyleft
```

#### Strong Copyleft (High Risk for Commercial)
```
GPL-2.0      - Full copyleft
GPL-3.0      - Full copyleft + patent terms
AGPL-3.0     - Network copyleft
```

#### Restrictive / Problematic
```
SSPL         - Server Side Public License (controversial)
Commons Clause - Adds commercial restrictions
Prosperity   - Non-commercial only
Fair Source  - Limited commercial use
```

### License Compatibility Matrix

| Your Project License | Can Use |
|---------------------|---------|
| MIT | MIT, BSD, Apache-2.0, ISC |
| Apache-2.0 | MIT, BSD, Apache-2.0, ISC |
| GPL-3.0 | MIT, BSD, Apache-2.0, ISC, GPL-3.0, LGPL-3.0 |
| Proprietary | MIT, BSD, Apache-2.0, ISC, LGPL (with care) |

### Automated Compliance

```json
// package.json script
{
  "scripts": {
    "license-check": "license-checker --onlyAllow 'MIT;Apache-2.0;BSD-3-Clause;ISC' --production"
  }
}
```

```yaml
# GitHub Actions
- name: License Check
  run: |
    npx license-checker --production --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC"
```

---

## CI/CD Integration

### GitHub Actions Security Workflow

```yaml
name: Security Audit

on:
  push:
    branches: [main]
  pull_request:
  schedule:
    - cron: '0 9 * * 1'  # Weekly Monday 9am

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Dependencies
        run: npm ci

      - name: Security Audit
        run: npm audit --audit-level=high
        continue-on-error: true

      - name: Snyk Security Scan
        uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
        with:
          args: --severity-threshold=high

      - name: License Check
        run: |
          npx license-checker --production --onlyAllow "MIT;Apache-2.0;BSD-3-Clause;ISC"

      - name: Upload Results
        uses: actions/upload-artifact@v4
        with:
          name: security-reports
          path: |
            npm-audit.json
            snyk-report.json
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Quick security check before commit
npm audit --audit-level=critical
if [ $? -ne 0 ]; then
  echo "Critical security vulnerabilities found!"
  echo "Run 'npm audit' for details."
  exit 1
fi
```

### Dependabot Security Updates

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "daily"
    open-pull-requests-limit: 10

    # Prioritize security updates
    groups:
      security-patches:
        applies-to: security-updates
```

---

## Security Policies

### SECURITY.md Template

```markdown
# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 2.x.x   | :white_check_mark: |
| 1.x.x   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities to security@example.com.

We will respond within 48 hours and provide a fix timeline.

Do not open public issues for security vulnerabilities.

## Security Practices

- Dependencies are audited weekly
- Critical vulnerabilities are patched within 24 hours
- All dependencies are pinned with lock files
- Production dependencies are reviewed before adding
```

### Automated Security Response

```yaml
# .github/workflows/security-response.yml
name: Security Alert Response

on:
  # Triggered by Dependabot security alerts
  dependabot_alert:
    types: [created]

jobs:
  respond:
    runs-on: ubuntu-latest
    steps:
      - name: Create Issue
        uses: actions/github-script@v7
        with:
          script: |
            await github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: `Security Alert: ${context.payload.alert.security_vulnerability.package.name}`,
              labels: ['security', 'priority:high'],
              body: `A security vulnerability was detected.\n\n` +
                    `**Package:** ${context.payload.alert.security_vulnerability.package.name}\n` +
                    `**Severity:** ${context.payload.alert.security_vulnerability.severity}\n`
            });
```

---

## Audit Report Template

```markdown
# Dependency Security Audit Report

**Project:** [Project Name]
**Date:** [Date]
**Auditor:** [Name/Tool]

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | N/A |
| High | 2 | In Progress |
| Medium | 5 | Scheduled |
| Low | 10 | Backlog |

## Critical Findings

_None_

## High Findings

### CVE-2024-1234: Package Name

- **Severity:** High (CVSS 7.5)
- **Affected Versions:** <2.0.0
- **Fixed In:** 2.0.0
- **Our Version:** 1.5.0
- **Status:** Upgrade scheduled for next release
- **Action:** Upgrade to ^2.0.0

### CVE-2024-5678: Another Package

- **Severity:** High (CVSS 8.0)
- **Status:** Workaround applied
- **Action:** Monitor for patch

## License Compliance

| License | Count | Approved |
|---------|-------|----------|
| MIT | 150 | Yes |
| Apache-2.0 | 30 | Yes |
| BSD-3-Clause | 10 | Yes |
| GPL-3.0 | 1 | **Review Required** |

## Recommendations

1. Upgrade lodash to 4.17.21
2. Replace deprecated request with fetch
3. Review GPL-licensed dependency

## Next Review

Scheduled: [Date + 30 days]
```
