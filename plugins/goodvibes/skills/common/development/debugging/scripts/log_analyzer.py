#!/usr/bin/env python3
"""
Log pattern analyzer for debugging assistance.

Usage:
    python log_analyzer.py --file app.log
    python log_analyzer.py --file app.log --level ERROR
    python log_analyzer.py --file app.log --pattern "timeout"
    python log_analyzer.py --file app.log --summary
"""

import argparse
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict

# =============================================================================
# CONFIGURATION
# =============================================================================

# Common log level patterns
LOG_LEVEL_PATTERNS = [
    r'\b(DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\b',
    r'\[(DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\]',
]

# Common timestamp patterns
TIMESTAMP_PATTERNS = [
    r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)',
    r'(\d{2}/\w{3}/\d{4}:\d{2}:\d{2}:\d{2})',
    r'(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})',
]

# Common error patterns
ERROR_PATTERNS = {
    'exception': r'(?i)(exception|error|traceback)',
    'timeout': r'(?i)(timeout|timed?\s*out)',
    'connection': r'(?i)(connection\s*(refused|reset|failed|error))',
    'memory': r'(?i)(out\s*of\s*memory|memory\s*(error|leak)|heap)',
    'permission': r'(?i)(permission\s*denied|access\s*denied|unauthorized)',
    'not_found': r'(?i)(not\s*found|404|no\s*such\s*file)',
}


@dataclass
class LogEntry:
    """Parsed log entry."""
    raw: str
    timestamp: Optional[str]
    level: Optional[str]
    message: str
    line_number: int


@dataclass
class AnalysisResult:
    """Analysis results."""
    total_lines: int
    error_count: int
    warning_count: int
    level_distribution: Dict[str, int]
    error_patterns: Dict[str, int]
    top_errors: List[tuple]
    time_range: Optional[tuple]


# =============================================================================
# PARSING
# =============================================================================

def extract_timestamp(line: str) -> Optional[str]:
    """Extract timestamp from log line."""
    for pattern in TIMESTAMP_PATTERNS:
        match = re.search(pattern, line)
        if match:
            return match.group(1)
    return None


def extract_level(line: str) -> Optional[str]:
    """Extract log level from log line."""
    for pattern in LOG_LEVEL_PATTERNS:
        match = re.search(pattern, line, re.IGNORECASE)
        if match:
            level = match.group(1).upper()
            if level == 'WARNING':
                level = 'WARN'
            return level
    return None


def parse_log_line(line: str, line_number: int) -> LogEntry:
    """Parse a single log line."""
    timestamp = extract_timestamp(line)
    level = extract_level(line)

    # Remove timestamp and level from message
    message = line
    if timestamp:
        message = message.replace(timestamp, '').strip()
    if level:
        message = re.sub(rf'\[?{level}\]?', '', message, flags=re.IGNORECASE).strip()

    return LogEntry(
        raw=line,
        timestamp=timestamp,
        level=level,
        message=message,
        line_number=line_number
    )


def parse_log_file(file_path: Path) -> List[LogEntry]:
    """Parse entire log file."""
    entries = []
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        for i, line in enumerate(f, 1):
            line = line.strip()
            if line:
                entries.append(parse_log_line(line, i))
    return entries


# =============================================================================
# ANALYSIS
# =============================================================================

def analyze_logs(entries: List[LogEntry]) -> AnalysisResult:
    """Analyze log entries for patterns."""
    level_counts = Counter()
    error_pattern_counts = Counter()
    error_messages = Counter()

    timestamps = []

    for entry in entries:
        # Count levels
        if entry.level:
            level_counts[entry.level] += 1

        # Count error patterns
        for pattern_name, pattern in ERROR_PATTERNS.items():
            if re.search(pattern, entry.raw):
                error_pattern_counts[pattern_name] += 1

        # Collect error messages for clustering
        if entry.level in ['ERROR', 'FATAL', 'CRITICAL']:
            # Normalize message (remove numbers, hashes, etc.)
            normalized = re.sub(r'\b[a-f0-9]{8,}\b', '<hash>', entry.message)
            normalized = re.sub(r'\b\d+\b', '<num>', normalized)
            error_messages[normalized[:100]] += 1

        # Collect timestamps
        if entry.timestamp:
            timestamps.append(entry.timestamp)

    # Get time range
    time_range = None
    if timestamps:
        time_range = (timestamps[0], timestamps[-1])

    return AnalysisResult(
        total_lines=len(entries),
        error_count=level_counts.get('ERROR', 0) + level_counts.get('FATAL', 0) + level_counts.get('CRITICAL', 0),
        warning_count=level_counts.get('WARN', 0),
        level_distribution=dict(level_counts),
        error_patterns=dict(error_pattern_counts),
        top_errors=error_messages.most_common(10),
        time_range=time_range,
    )


def filter_entries(
    entries: List[LogEntry],
    level: Optional[str] = None,
    pattern: Optional[str] = None,
) -> List[LogEntry]:
    """Filter log entries by level or pattern."""
    result = entries

    if level:
        level = level.upper()
        if level == 'WARNING':
            level = 'WARN'
        result = [e for e in result if e.level == level]

    if pattern:
        regex = re.compile(pattern, re.IGNORECASE)
        result = [e for e in result if regex.search(e.raw)]

    return result


# =============================================================================
# OUTPUT
# =============================================================================

def print_summary(result: AnalysisResult):
    """Print analysis summary."""
    print("=" * 60)
    print("LOG ANALYSIS SUMMARY")
    print("=" * 60)

    print(f"\nTotal Lines: {result.total_lines}")
    print(f"Errors: {result.error_count}")
    print(f"Warnings: {result.warning_count}")

    if result.time_range:
        print(f"\nTime Range: {result.time_range[0]} to {result.time_range[1]}")

    print("\n--- Level Distribution ---")
    for level, count in sorted(result.level_distribution.items(), key=lambda x: -x[1]):
        pct = count / result.total_lines * 100 if result.total_lines > 0 else 0
        print(f"  {level}: {count} ({pct:.1f}%)")

    if result.error_patterns:
        print("\n--- Error Patterns ---")
        for pattern, count in sorted(result.error_patterns.items(), key=lambda x: -x[1]):
            print(f"  {pattern}: {count}")

    if result.top_errors:
        print("\n--- Top Error Messages ---")
        for i, (msg, count) in enumerate(result.top_errors, 1):
            print(f"  {i}. ({count}x) {msg[:70]}...")

    print("\n" + "=" * 60)


def print_entries(entries: List[LogEntry], limit: int = 100):
    """Print log entries."""
    for entry in entries[:limit]:
        level_str = f"[{entry.level}]" if entry.level else ""
        ts_str = entry.timestamp or ""
        print(f"Line {entry.line_number}: {ts_str} {level_str} {entry.message[:100]}")

    if len(entries) > limit:
        print(f"\n... and {len(entries) - limit} more entries")


# =============================================================================
# MAIN
# =============================================================================

def main():
    parser = argparse.ArgumentParser(description='Analyze log files for patterns')
    parser.add_argument('--file', required=True, help='Log file to analyze')
    parser.add_argument('--level', help='Filter by log level (DEBUG, INFO, WARN, ERROR)')
    parser.add_argument('--pattern', help='Filter by regex pattern')
    parser.add_argument('--summary', action='store_true', help='Show summary only')
    parser.add_argument('--limit', type=int, default=100, help='Max entries to display')

    args = parser.parse_args()

    file_path = Path(args.file)
    if not file_path.exists():
        print(f"Error: File {file_path} not found")
        return 1

    print(f"Parsing {file_path}...")
    entries = parse_log_file(file_path)
    print(f"Parsed {len(entries)} log entries")

    # Filter if requested
    if args.level or args.pattern:
        entries = filter_entries(entries, args.level, args.pattern)
        print(f"Filtered to {len(entries)} entries")

    # Analyze
    result = analyze_logs(entries)

    # Output
    if args.summary or (not args.level and not args.pattern):
        print_summary(result)
    else:
        print_entries(entries, args.limit)

    return 0


if __name__ == '__main__':
    exit(main())
