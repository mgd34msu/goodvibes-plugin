#!/usr/bin/env python3
"""
Security pattern scanner for common vulnerabilities.

Usage:
    python security_scan.py --path ./src
    python security_scan.py --path ./src --output report.json
    python security_scan.py --path ./src --severity high
"""

import argparse
import json
import os
import re
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Optional

# =============================================================================
# CONFIGURATION - Patterns to detect
# =============================================================================

SECRETS_PATTERNS = {
    "AWS Access Key": r"AKIA[0-9A-Z]{16}",
    "AWS Secret Key": r"(?i)aws_secret_access_key.{0,20}['\"][0-9a-zA-Z/+=]{40}",
    "GitHub Token": r"gh[pousr]_[A-Za-z0-9_]{36,}",
    "Google API Key": r"AIza[0-9A-Za-z\-_]{35}",
    "Slack Token": r"xox[baprs]-[0-9a-zA-Z]{10,}",
    "Stripe Key": r"sk_live_[0-9a-zA-Z]{24,}",
    "Private Key": r"-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "Generic API Key": r"(?i)(api[_-]?key|apikey)['\"\s:=]+['\"]?[a-zA-Z0-9_-]{20,}",
    "Generic Secret": r"(?i)(secret|password|passwd|pwd)['\"\s:=]+['\"][^'\"]{8,}['\"]",
    "JWT Token": r"eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+",
    "Connection String": r"(?i)(mongodb|postgres|mysql|redis)://[^\s'\"]+",
}

SQL_INJECTION_PATTERNS = {
    "String Concatenation (JS)": r"(query|execute)\s*\(\s*[`'\"].*\$\{",
    "String Concatenation (Python)": r"(execute|cursor\.execute)\s*\(\s*f?['\"].*\{",
    "String Addition": r"(query|execute)\s*\(\s*['\"].*['\"]?\s*\+\s*",
    "Format String": r"\.format\s*\([^)]*\).*(?:SELECT|INSERT|UPDATE|DELETE)",
}

COMMAND_INJECTION_PATTERNS = {
    "Shell Exec (JS)": r"(exec|execSync|spawn)\s*\(\s*[`'\"].*\$\{",
    "Shell Exec (Python)": r"(os\.system|subprocess\.call|subprocess\.run)\s*\(\s*f?['\"]",
    "Shell True": r"shell\s*=\s*True",
}

XSS_PATTERNS = {
    "innerHTML Assignment": r"\.innerHTML\s*=",
    "document.write": r"document\.write\s*\(",
    "Dangerous React": r"dangerouslySetInnerHTML",
    "v-html Directive": r"v-html\s*=",
}

PATH_TRAVERSAL_PATTERNS = {
    "Unvalidated Path Join": r"(path\.join|os\.path\.join)\s*\([^)]*req\.",
    "Direct File Access": r"(readFile|readFileSync|open)\s*\([^)]*req\.",
}

CRYPTO_PATTERNS = {
    "MD5 Usage": r"(?i)(md5|createHash\s*\(\s*['\"]md5)",
    "SHA1 Usage": r"(?i)(sha1|createHash\s*\(\s*['\"]sha1)",
    "Weak Random": r"Math\.random\s*\(",
    "ECB Mode": r"(?i)mode\s*[=:]\s*['\"]?ecb",
}

# Severity levels for each category
SEVERITY = {
    "secrets": "critical",
    "sql_injection": "critical",
    "command_injection": "critical",
    "xss": "high",
    "path_traversal": "high",
    "crypto": "medium",
}

# File extensions to scan
SCAN_EXTENSIONS = {
    ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",  # JavaScript
    ".py", ".pyw",  # Python
    ".go",  # Go
    ".java",  # Java
    ".rb",  # Ruby
    ".php",  # PHP
    ".cs",  # C#
    ".env", ".yaml", ".yml", ".json", ".xml", ".config",  # Config
}

# Directories to skip
SKIP_DIRS = {
    "node_modules", ".git", "__pycache__", "venv", ".venv",
    "dist", "build", "vendor", ".next", ".nuxt", "coverage",
}


@dataclass
class Finding:
    """A security finding."""
    category: str
    pattern_name: str
    severity: str
    file_path: str
    line_number: int
    line_content: str

    def to_dict(self):
        return asdict(self)


def should_scan_file(file_path: Path) -> bool:
    """Check if file should be scanned."""
    return file_path.suffix.lower() in SCAN_EXTENSIONS


def should_skip_dir(dir_name: str) -> bool:
    """Check if directory should be skipped."""
    return dir_name in SKIP_DIRS


def scan_file(file_path: Path, patterns: dict, category: str, severity: str) -> List[Finding]:
    """Scan a single file for patterns."""
    findings = []

    try:
        content = file_path.read_text(encoding="utf-8", errors="ignore")
        lines = content.split("\n")

        for pattern_name, pattern in patterns.items():
            regex = re.compile(pattern)

            for line_num, line in enumerate(lines, 1):
                if regex.search(line):
                    # Skip if it looks like a comment or test
                    stripped = line.strip()
                    if stripped.startswith(("//", "#", "*", "/*", "'''", '"""')):
                        continue
                    if "test" in str(file_path).lower() or "mock" in str(file_path).lower():
                        continue

                    findings.append(Finding(
                        category=category,
                        pattern_name=pattern_name,
                        severity=severity,
                        file_path=str(file_path),
                        line_number=line_num,
                        line_content=line.strip()[:200],  # Truncate long lines
                    ))
    except Exception as e:
        print(f"Error scanning {file_path}: {e}")

    return findings


def scan_directory(path: Path, min_severity: Optional[str] = None) -> List[Finding]:
    """Recursively scan directory for security issues."""
    findings = []
    severity_order = ["low", "medium", "high", "critical"]

    min_severity_idx = 0
    if min_severity:
        min_severity_idx = severity_order.index(min_severity.lower())

    pattern_groups = [
        (SECRETS_PATTERNS, "secrets"),
        (SQL_INJECTION_PATTERNS, "sql_injection"),
        (COMMAND_INJECTION_PATTERNS, "command_injection"),
        (XSS_PATTERNS, "xss"),
        (PATH_TRAVERSAL_PATTERNS, "path_traversal"),
        (CRYPTO_PATTERNS, "crypto"),
    ]

    for root, dirs, files in os.walk(path):
        # Skip unwanted directories
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]

        for file_name in files:
            file_path = Path(root) / file_name

            if not should_scan_file(file_path):
                continue

            for patterns, category in pattern_groups:
                severity = SEVERITY[category]

                # Skip if below minimum severity
                if severity_order.index(severity) < min_severity_idx:
                    continue

                file_findings = scan_file(file_path, patterns, category, severity)
                findings.extend(file_findings)

    return findings


def format_report(findings: List[Finding]) -> str:
    """Format findings as a readable report."""
    if not findings:
        return "No security issues found."

    # Group by severity
    by_severity = {"critical": [], "high": [], "medium": [], "low": []}
    for f in findings:
        by_severity[f.severity].append(f)

    lines = [
        "# Security Scan Report",
        "",
        "## Summary",
        f"- Critical: {len(by_severity['critical'])}",
        f"- High: {len(by_severity['high'])}",
        f"- Medium: {len(by_severity['medium'])}",
        f"- Low: {len(by_severity['low'])}",
        "",
    ]

    for severity in ["critical", "high", "medium", "low"]:
        if by_severity[severity]:
            lines.append(f"## {severity.upper()} Severity")
            lines.append("")

            for finding in by_severity[severity]:
                lines.append(f"### {finding.pattern_name}")
                lines.append(f"**Category:** {finding.category}")
                lines.append(f"**File:** {finding.file_path}:{finding.line_number}")
                lines.append(f"```")
                lines.append(finding.line_content)
                lines.append(f"```")
                lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Scan code for security vulnerabilities")
    parser.add_argument("--path", required=True, help="Path to scan")
    parser.add_argument("--output", help="Output file (JSON format)")
    parser.add_argument("--severity", choices=["low", "medium", "high", "critical"],
                       help="Minimum severity to report")
    parser.add_argument("--json", action="store_true", help="Output as JSON")

    args = parser.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"Error: Path {path} does not exist")
        return 1

    findings = scan_directory(path, args.severity)

    if args.json or args.output:
        output = json.dumps([f.to_dict() for f in findings], indent=2)
        if args.output:
            Path(args.output).write_text(output)
            print(f"Report written to {args.output}")
        else:
            print(output)
    else:
        print(format_report(findings))

    # Exit with error code if critical/high issues found
    critical_high = [f for f in findings if f.severity in ["critical", "high"]]
    return 1 if critical_high else 0


if __name__ == "__main__":
    exit(main())
