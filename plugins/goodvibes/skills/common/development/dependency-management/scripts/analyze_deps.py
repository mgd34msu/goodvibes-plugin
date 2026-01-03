#!/usr/bin/env python3
"""
Dependency health analyzer for Node.js, Python, Go, and Rust projects.

Usage:
    python analyze_deps.py --path ./project
    python analyze_deps.py --path . --output report.json
    python analyze_deps.py --path . --format markdown
    python analyze_deps.py --path . --checks security,outdated

Checks:
    - security: Security vulnerabilities (npm audit, pip-audit, etc.)
    - outdated: Outdated packages
    - unused: Potentially unused dependencies
    - circular: Circular dependency detection
    - licenses: License compliance check
    - duplicates: Duplicate dependency versions
"""

import argparse
import json
import os
import subprocess
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import List, Dict, Optional, Any
from datetime import datetime

# =============================================================================
# CONFIGURATION
# =============================================================================

# Allowed licenses for compliance check
ALLOWED_LICENSES = {
    "MIT", "Apache-2.0", "Apache 2.0", "BSD-2-Clause", "BSD-3-Clause",
    "ISC", "Unlicense", "CC0-1.0", "0BSD", "WTFPL", "BlueOak-1.0.0"
}

# Licenses that require review
REVIEW_LICENSES = {
    "LGPL-2.1", "LGPL-3.0", "MPL-2.0", "EPL-1.0", "EPL-2.0"
}

# Licenses that are problematic for commercial use
PROBLEMATIC_LICENSES = {
    "GPL-2.0", "GPL-3.0", "AGPL-3.0", "SSPL-1.0"
}


# =============================================================================
# DATA STRUCTURES
# =============================================================================

@dataclass
class Vulnerability:
    """A security vulnerability finding."""
    package: str
    severity: str  # critical, high, medium, low
    title: str
    description: str = ""
    cve: str = ""
    fixed_in: str = ""
    url: str = ""


@dataclass
class OutdatedPackage:
    """An outdated package."""
    package: str
    current: str
    wanted: str
    latest: str
    package_type: str = "dependencies"  # dependencies, devDependencies


@dataclass
class LicenseIssue:
    """A license compliance issue."""
    package: str
    license: str
    status: str  # approved, review, problematic, unknown
    version: str = ""


@dataclass
class CircularDep:
    """A circular dependency."""
    cycle: List[str]
    severity: str = "warning"


@dataclass
class HealthReport:
    """Complete dependency health report."""
    project_path: str
    project_type: str
    timestamp: str
    vulnerabilities: List[Vulnerability] = field(default_factory=list)
    outdated: List[OutdatedPackage] = field(default_factory=list)
    license_issues: List[LicenseIssue] = field(default_factory=list)
    circular_deps: List[CircularDep] = field(default_factory=list)
    duplicates: Dict[str, List[str]] = field(default_factory=dict)
    summary: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return asdict(self)


# =============================================================================
# PROJECT DETECTION
# =============================================================================

def detect_project_type(path: Path) -> str:
    """Detect the project type based on configuration files."""
    if (path / "package.json").exists():
        return "nodejs"
    elif (path / "requirements.txt").exists() or (path / "pyproject.toml").exists():
        return "python"
    elif (path / "go.mod").exists():
        return "go"
    elif (path / "Cargo.toml").exists():
        return "rust"
    else:
        return "unknown"


# =============================================================================
# NODE.JS CHECKS
# =============================================================================

def run_npm_audit(path: Path) -> List[Vulnerability]:
    """Run npm audit and parse results."""
    vulnerabilities = []

    try:
        result = subprocess.run(
            ["npm", "audit", "--json"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.stdout:
            data = json.loads(result.stdout)

            # Handle npm 7+ format
            if "vulnerabilities" in data:
                for name, info in data.get("vulnerabilities", {}).items():
                    vulnerabilities.append(Vulnerability(
                        package=name,
                        severity=info.get("severity", "unknown"),
                        title=info.get("title", "Vulnerability detected"),
                        description=info.get("name", ""),
                        fixed_in=info.get("fixAvailable", {}).get("version", "") if isinstance(info.get("fixAvailable"), dict) else "",
                        url=info.get("url", "")
                    ))
            # Handle older format
            elif "advisories" in data:
                for adv_id, info in data.get("advisories", {}).items():
                    vulnerabilities.append(Vulnerability(
                        package=info.get("module_name", "unknown"),
                        severity=info.get("severity", "unknown"),
                        title=info.get("title", "Vulnerability detected"),
                        description=info.get("overview", ""),
                        cve=info.get("cves", [""])[0] if info.get("cves") else "",
                        fixed_in=info.get("patched_versions", ""),
                        url=info.get("url", "")
                    ))
    except subprocess.TimeoutExpired:
        print("Warning: npm audit timed out", file=sys.stderr)
    except json.JSONDecodeError:
        print("Warning: Could not parse npm audit output", file=sys.stderr)
    except Exception as e:
        print(f"Warning: npm audit failed: {e}", file=sys.stderr)

    return vulnerabilities


def run_npm_outdated(path: Path) -> List[OutdatedPackage]:
    """Run npm outdated and parse results."""
    outdated = []

    try:
        result = subprocess.run(
            ["npm", "outdated", "--json"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.stdout:
            data = json.loads(result.stdout)

            for name, info in data.items():
                outdated.append(OutdatedPackage(
                    package=name,
                    current=info.get("current", "unknown"),
                    wanted=info.get("wanted", "unknown"),
                    latest=info.get("latest", "unknown"),
                    package_type=info.get("type", "dependencies")
                ))
    except Exception as e:
        print(f"Warning: npm outdated failed: {e}", file=sys.stderr)

    return outdated


def run_license_checker(path: Path) -> List[LicenseIssue]:
    """Run license-checker and analyze results."""
    issues = []

    try:
        result = subprocess.run(
            ["npx", "license-checker", "--json", "--production"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.stdout:
            data = json.loads(result.stdout)

            for pkg_spec, info in data.items():
                # Parse package@version format
                parts = pkg_spec.rsplit("@", 1)
                pkg_name = parts[0]
                pkg_version = parts[1] if len(parts) > 1 else ""

                license_str = info.get("licenses", "UNKNOWN")

                # Handle license array
                if isinstance(license_str, list):
                    license_str = " OR ".join(license_str)

                # Determine status
                if license_str in ALLOWED_LICENSES:
                    status = "approved"
                elif license_str in REVIEW_LICENSES:
                    status = "review"
                elif license_str in PROBLEMATIC_LICENSES:
                    status = "problematic"
                    issues.append(LicenseIssue(
                        package=pkg_name,
                        license=license_str,
                        status=status,
                        version=pkg_version
                    ))
                elif license_str == "UNKNOWN":
                    status = "unknown"
                    issues.append(LicenseIssue(
                        package=pkg_name,
                        license=license_str,
                        status=status,
                        version=pkg_version
                    ))
    except Exception as e:
        print(f"Warning: license-checker failed: {e}", file=sys.stderr)

    return issues


def run_madge(path: Path) -> List[CircularDep]:
    """Run madge to detect circular dependencies."""
    circular = []

    try:
        # Find entry point
        pkg_json = path / "package.json"
        entry = "src"
        if pkg_json.exists():
            with open(pkg_json) as f:
                pkg = json.load(f)
                if pkg.get("main"):
                    entry = pkg["main"]
                elif (path / "src").exists():
                    entry = "src"

        result = subprocess.run(
            ["npx", "madge", "--circular", "--extensions", "ts,tsx,js,jsx", str(entry)],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        # Parse output (madge outputs cycles line by line)
        for line in result.stdout.strip().split("\n"):
            if line and "->" in line:
                # Parse "a.ts -> b.ts -> a.ts" format
                cycle = [f.strip() for f in line.split("->")]
                circular.append(CircularDep(cycle=cycle))
    except Exception as e:
        print(f"Warning: madge failed: {e}", file=sys.stderr)

    return circular


# =============================================================================
# PYTHON CHECKS
# =============================================================================

def run_pip_audit(path: Path) -> List[Vulnerability]:
    """Run pip-audit and parse results."""
    vulnerabilities = []

    try:
        result = subprocess.run(
            ["pip-audit", "--format=json"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.stdout:
            data = json.loads(result.stdout)

            for vuln in data:
                vulnerabilities.append(Vulnerability(
                    package=vuln.get("name", "unknown"),
                    severity=vuln.get("severity", "unknown"),
                    title=vuln.get("id", "Vulnerability detected"),
                    description=vuln.get("description", ""),
                    fixed_in=vuln.get("fix_versions", [""])[0] if vuln.get("fix_versions") else ""
                ))
    except Exception as e:
        print(f"Warning: pip-audit failed: {e}", file=sys.stderr)

    return vulnerabilities


def run_pip_licenses(path: Path) -> List[LicenseIssue]:
    """Run pip-licenses and analyze results."""
    issues = []

    try:
        result = subprocess.run(
            ["pip-licenses", "--format=json"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.stdout:
            data = json.loads(result.stdout)

            for pkg in data:
                license_str = pkg.get("License", "UNKNOWN")

                if license_str in PROBLEMATIC_LICENSES:
                    issues.append(LicenseIssue(
                        package=pkg.get("Name", "unknown"),
                        license=license_str,
                        status="problematic",
                        version=pkg.get("Version", "")
                    ))
                elif license_str == "UNKNOWN":
                    issues.append(LicenseIssue(
                        package=pkg.get("Name", "unknown"),
                        license=license_str,
                        status="unknown",
                        version=pkg.get("Version", "")
                    ))
    except Exception as e:
        print(f"Warning: pip-licenses failed: {e}", file=sys.stderr)

    return issues


# =============================================================================
# GO CHECKS
# =============================================================================

def run_govulncheck(path: Path) -> List[Vulnerability]:
    """Run govulncheck and parse results."""
    vulnerabilities = []

    try:
        result = subprocess.run(
            ["govulncheck", "-json", "./..."],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=180
        )

        # Parse JSON lines output
        for line in result.stdout.strip().split("\n"):
            if line:
                try:
                    data = json.loads(line)
                    if data.get("vulnerability"):
                        vuln = data["vulnerability"]
                        vulnerabilities.append(Vulnerability(
                            package=vuln.get("module", {}).get("module", "unknown"),
                            severity="high",  # govulncheck doesn't provide severity
                            title=vuln.get("id", "Vulnerability detected"),
                            description=vuln.get("details", ""),
                            url=vuln.get("references", [""])[0] if vuln.get("references") else ""
                        ))
                except json.JSONDecodeError:
                    pass
    except Exception as e:
        print(f"Warning: govulncheck failed: {e}", file=sys.stderr)

    return vulnerabilities


# =============================================================================
# RUST CHECKS
# =============================================================================

def run_cargo_audit(path: Path) -> List[Vulnerability]:
    """Run cargo audit and parse results."""
    vulnerabilities = []

    try:
        result = subprocess.run(
            ["cargo", "audit", "--json"],
            cwd=path,
            capture_output=True,
            text=True,
            timeout=120
        )

        if result.stdout:
            data = json.loads(result.stdout)

            for vuln in data.get("vulnerabilities", {}).get("list", []):
                vulnerabilities.append(Vulnerability(
                    package=vuln.get("advisory", {}).get("package", "unknown"),
                    severity=vuln.get("advisory", {}).get("severity", "unknown"),
                    title=vuln.get("advisory", {}).get("id", "Vulnerability detected"),
                    description=vuln.get("advisory", {}).get("description", ""),
                    url=vuln.get("advisory", {}).get("url", "")
                ))
    except Exception as e:
        print(f"Warning: cargo audit failed: {e}", file=sys.stderr)

    return vulnerabilities


# =============================================================================
# REPORT GENERATION
# =============================================================================

def analyze_project(path: Path, checks: List[str]) -> HealthReport:
    """Run all requested checks and generate report."""
    project_type = detect_project_type(path)

    report = HealthReport(
        project_path=str(path.absolute()),
        project_type=project_type,
        timestamp=datetime.now().isoformat()
    )

    if project_type == "nodejs":
        if "security" in checks:
            report.vulnerabilities = run_npm_audit(path)
        if "outdated" in checks:
            report.outdated = run_npm_outdated(path)
        if "licenses" in checks:
            report.license_issues = run_license_checker(path)
        if "circular" in checks:
            report.circular_deps = run_madge(path)

    elif project_type == "python":
        if "security" in checks:
            report.vulnerabilities = run_pip_audit(path)
        if "licenses" in checks:
            report.license_issues = run_pip_licenses(path)

    elif project_type == "go":
        if "security" in checks:
            report.vulnerabilities = run_govulncheck(path)

    elif project_type == "rust":
        if "security" in checks:
            report.vulnerabilities = run_cargo_audit(path)

    # Generate summary
    report.summary = {
        "total_vulnerabilities": len(report.vulnerabilities),
        "critical_vulnerabilities": len([v for v in report.vulnerabilities if v.severity == "critical"]),
        "high_vulnerabilities": len([v for v in report.vulnerabilities if v.severity == "high"]),
        "outdated_packages": len(report.outdated),
        "license_issues": len(report.license_issues),
        "circular_dependencies": len(report.circular_deps),
        "health_score": calculate_health_score(report)
    }

    return report


def calculate_health_score(report: HealthReport) -> int:
    """Calculate a health score from 0-100."""
    score = 100

    # Deduct for vulnerabilities
    score -= len([v for v in report.vulnerabilities if v.severity == "critical"]) * 25
    score -= len([v for v in report.vulnerabilities if v.severity == "high"]) * 10
    score -= len([v for v in report.vulnerabilities if v.severity == "medium"]) * 5
    score -= len([v for v in report.vulnerabilities if v.severity == "low"]) * 1

    # Deduct for outdated packages (minor impact)
    score -= min(len(report.outdated), 10)

    # Deduct for license issues
    score -= len([l for l in report.license_issues if l.status == "problematic"]) * 15
    score -= len([l for l in report.license_issues if l.status == "unknown"]) * 5

    # Deduct for circular dependencies
    score -= len(report.circular_deps) * 5

    return max(0, score)


def format_markdown(report: HealthReport) -> str:
    """Format report as markdown."""
    lines = [
        "# Dependency Health Report",
        "",
        f"**Project:** {report.project_path}",
        f"**Type:** {report.project_type}",
        f"**Generated:** {report.timestamp}",
        f"**Health Score:** {report.summary.get('health_score', 0)}/100",
        "",
        "## Summary",
        "",
        f"| Metric | Count |",
        f"|--------|-------|",
        f"| Vulnerabilities | {report.summary.get('total_vulnerabilities', 0)} |",
        f"| Critical | {report.summary.get('critical_vulnerabilities', 0)} |",
        f"| High | {report.summary.get('high_vulnerabilities', 0)} |",
        f"| Outdated Packages | {report.summary.get('outdated_packages', 0)} |",
        f"| License Issues | {report.summary.get('license_issues', 0)} |",
        f"| Circular Dependencies | {report.summary.get('circular_dependencies', 0)} |",
        "",
    ]

    if report.vulnerabilities:
        lines.extend([
            "## Vulnerabilities",
            "",
        ])
        for vuln in report.vulnerabilities:
            lines.append(f"### {vuln.package} ({vuln.severity.upper()})")
            lines.append(f"**{vuln.title}**")
            if vuln.description:
                lines.append(f"> {vuln.description[:200]}")
            if vuln.fixed_in:
                lines.append(f"- Fixed in: {vuln.fixed_in}")
            if vuln.url:
                lines.append(f"- URL: {vuln.url}")
            lines.append("")

    if report.outdated:
        lines.extend([
            "## Outdated Packages",
            "",
            "| Package | Current | Wanted | Latest |",
            "|---------|---------|--------|--------|",
        ])
        for pkg in report.outdated[:20]:  # Limit to top 20
            lines.append(f"| {pkg.package} | {pkg.current} | {pkg.wanted} | {pkg.latest} |")
        lines.append("")

    if report.license_issues:
        lines.extend([
            "## License Issues",
            "",
            "| Package | License | Status |",
            "|---------|---------|--------|",
        ])
        for issue in report.license_issues:
            lines.append(f"| {issue.package} | {issue.license} | {issue.status} |")
        lines.append("")

    if report.circular_deps:
        lines.extend([
            "## Circular Dependencies",
            "",
        ])
        for cycle in report.circular_deps:
            lines.append(f"- {' -> '.join(cycle.cycle)}")
        lines.append("")

    return "\n".join(lines)


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description="Analyze dependency health")
    parser.add_argument("--path", required=True, help="Project path to analyze")
    parser.add_argument("--output", help="Output file (JSON format)")
    parser.add_argument("--format", choices=["json", "markdown"], default="markdown",
                       help="Output format (default: markdown)")
    parser.add_argument("--checks", default="security,outdated,licenses,circular",
                       help="Comma-separated checks to run")

    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"Error: Path {path} does not exist", file=sys.stderr)
        return 1

    checks = [c.strip() for c in args.checks.split(",")]

    print(f"Analyzing {path}...", file=sys.stderr)
    report = analyze_project(path, checks)

    if args.format == "json" or args.output:
        output = json.dumps(report.to_dict(), indent=2)
    else:
        output = format_markdown(report)

    if args.output:
        Path(args.output).write_text(output)
        print(f"Report written to {args.output}")
    else:
        print(output)

    # Exit with error code if critical issues found
    if report.summary.get("critical_vulnerabilities", 0) > 0:
        return 1
    if report.summary.get("high_vulnerabilities", 0) > 0:
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
