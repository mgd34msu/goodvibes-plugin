#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { analyzeCosts, formatOutput } from './cost-analysis/index.js';
import type { ExtendedCostAnalysisOptions, OutputFormat, TimeFilter } from './cost-analysis/types.js';

function printHelp(): void {
  console.log(`
Cost Analysis CLI - Analyze Claude API usage and costs

USAGE:
  cost-analysis [OPTIONS]

OPTIONS:
  -s, --start <date>       Start date (ISO format: 2026-01-15T16:00:00Z)
  -e, --end <date>         End date (ISO format)
  -l, --last <period>      Relative time period (e.g., "7d", "24h", "2w", "1m")
  -p, --project <name>     Filter to specific project(s) (can be used multiple times)
  -m, --model <id>         Filter to specific model(s) (can be used multiple times)
  -f, --format <format>    Output format: text, json, markdown, minimal (default: text)
  --top-tools <n>          Limit tool breakdown to top N tools (default: 40)
  --no-tools               Exclude tool breakdown from output
  --group-by <period>      Group results by period: daily, weekly, monthly, session
  --subagents              Include subagent session analysis
  --batches                Include batch engine analysis
  --compare                Include native vs MCP tool comparison
  --per-call               Include per-call token metrics
  --all                    Enable all extended analysis modes
  -h, --help               Show this help message

EXAMPLES:
  # Analyze last 7 days with default text output
  cost-analysis --last 7d

  # Analyze specific date range
  cost-analysis --start 2026-01-15T00:00:00Z --end 2026-01-22T23:59:59Z

  # Filter to specific project with JSON output
  cost-analysis --last 30d --project "my-project" --format json

  # Show only top 10 tools
  cost-analysis --last 7d --top-tools 10

  # Minimal one-line summary for the last 24 hours
  cost-analysis --last 24h --format minimal

  # Export to markdown report
  cost-analysis --last 1m --format markdown > report.md

  # Exclude tool breakdown for cleaner output
  cost-analysis --last 7d --no-tools
`);
}

async function main(): Promise<void> {
  try {
    const { values } = parseArgs({
      options: {
        start: {
          type: 'string',
          short: 's',
        },
        end: {
          type: 'string',
          short: 'e',
        },
        last: {
          type: 'string',
          short: 'l',
        },
        project: {
          type: 'string',
          short: 'p',
          multiple: true,
        },
        model: {
          type: 'string',
          short: 'm',
          multiple: true,
        },
        format: {
          type: 'string',
          short: 'f',
          default: 'text',
        },
        'top-tools': {
          type: 'string',
        },
        'no-tools': {
          type: 'boolean',
        },
        'group-by': {
          type: 'string',
        },
        subagents: {
          type: 'boolean',
        },
        batches: {
          type: 'boolean',
        },
        compare: {
          type: 'boolean',
        },
        'per-call': {
          type: 'boolean',
        },
        all: {
          type: 'boolean',
        },
        help: {
          type: 'boolean',
          short: 'h',
        },
      },
      allowPositionals: false,
    });

    // Show help if requested
    if (values.help) {
      printHelp();
      process.exit(0);
    }

    // Build time filter
    let timeFilter: TimeFilter | undefined;

    if (values.start || values.end) {
      timeFilter = {
        type: 'absolute',
        startDate: values.start,
        endDate: values.end,
      };
    } else if (values.last) {
      if (!/^\d+[hdwm]$/.test(values.last)) {
        console.error('Error: Invalid --last format. Use format like: 7d, 24h, 2w, 1m');
        process.exit(1);
      }
      timeFilter = {
        type: 'relative',
        relativeStart: values.last,
      };
    }

    // Validate format
    const validFormats: OutputFormat[] = ['text', 'json', 'markdown', 'minimal'];
    const format = (values.format as OutputFormat) || 'text';
    if (!validFormats.includes(format)) {
      console.error(`Error: Invalid format "${format}". Must be one of: ${validFormats.join(', ')}`);
      process.exit(1);
    }

    // Build options
    const options: ExtendedCostAnalysisOptions = {
      timeFilter,
      outputFormat: format,
    };

    if (values.project) {
      options.projectFilter = Array.isArray(values.project) ? values.project : [values.project];
    }

    if (values.model) {
      options.modelFilter = Array.isArray(values.model) ? values.model : [values.model];
    }

    if (values['top-tools']) {
      const topTools = parseInt(values['top-tools'], 10);
      if (isNaN(topTools) || topTools < 1) {
        console.error('Error: --top-tools must be a positive integer');
        process.exit(1);
      }
      options.topToolsLimit = topTools;
    }

    if (values['no-tools']) {
      options.includeTools = false;
    }

    if (values['group-by']) {
      const validGroupBy = ['none', 'daily', 'weekly', 'monthly', 'session'];
      if (!validGroupBy.includes(values['group-by'])) {
        console.error(`Error: Invalid --group-by "${values['group-by']}". Must be one of: ${validGroupBy.join(', ')}`);
        process.exit(1);
      }
      options.groupBy = values['group-by'] as 'none' | 'daily' | 'weekly' | 'monthly' | 'session';
    }

    // Extended analysis options
    if (values.subagents || values.all) {
      options.includeSubagents = true;
    }

    if (values.batches || values.all) {
      options.includeBatches = true;
    }

    if (values.compare || values.all) {
      options.includeComparisons = true;
    }

    // Run analysis
    const result = await analyzeCosts(options);

    // Format and output
    const output = formatOutput(result, format);
    console.log(output);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
