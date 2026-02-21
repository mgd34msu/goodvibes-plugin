import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Aggregator } from '../daemon/aggregator.js';
import { HistoricalStore } from '../data/historical-store.js';
import type { AnalyticsExportInput } from '../schemas/tools.js';
import type { SessionArchive, SessionMetrics, DashboardState } from '../types.js';
import type { HandlerResponse } from './types.js';

// === Section keys ===

type SectionKey = 'tokens' | 'cache' | 'commands' | 'agents' | 'files' | 'cost' | 'timeline';

const ALL_SECTIONS: SectionKey[] = ['tokens', 'cache', 'commands', 'agents', 'files', 'cost', 'timeline'];

// === Helpers ===

/**
 * Extract the requested data sections from a DashboardState.
 */
function extractSections(
  state: DashboardState,
  sections: SectionKey[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  if (sections.includes('tokens')) {
    result['tokens'] = state.metrics.tokens;
  }
  if (sections.includes('cache')) {
    result['cache'] = state.metrics.cache;
  }
  if (sections.includes('commands')) {
    result['commands'] = state.metrics.commands;
  }
  if (sections.includes('agents')) {
    result['agents'] = state.metrics.agents;
  }
  if (sections.includes('files')) {
    result['files'] = state.metrics.files;
  }
  if (sections.includes('cost')) {
    result['cost'] = state.metrics.cost;
  }
  if (sections.includes('timeline')) {
    result['timeline'] = {
      session_id: state.session_id,
      started_at: state.started_at,
      uptime_ms: state.uptime_ms,
      recent_activity: state.recent_activity,
    };
  }

  return result;
}

/**
 * Extract sections from a SessionArchive.
 */
function extractArchiveSections(
  archive: SessionArchive,
  sections: SectionKey[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const m: SessionMetrics = archive.metrics;

  if (sections.includes('tokens'))   result['tokens']   = m.tokens;
  if (sections.includes('cache'))    result['cache']    = m.cache;
  if (sections.includes('commands')) result['commands'] = m.commands;
  if (sections.includes('agents'))   result['agents']   = m.agents;
  if (sections.includes('files'))    result['files']    = m.files;
  if (sections.includes('cost'))     result['cost']     = m.cost;
  if (sections.includes('timeline')) {
    result['timeline'] = {
      session_id:       archive.session_id,
      tags:             archive.tags,
      tag:              archive.tags?.[0] ?? null,
      name:             archive.name,
      started_at:       archive.started_at,
      ended_at:         archive.ended_at,
      duration_minutes: archive.duration_minutes,
    };
  }

  return result;
}

// === Format builders ===

/**
 * Render data as a JSON string.
 */
function renderJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Render a flat record as a two-column CSV.
 * Nested objects are JSON-encoded into the value cell.
 */
function renderCsv(data: Record<string, unknown>): string {
  const rows: string[] = ['section,value'];

  function flattenInto(prefix: string, obj: unknown): void {
    if (obj === null || obj === undefined) {
      rows.push(`${prefix},`);
      return;
    }
    if (typeof obj !== 'object' || Array.isArray(obj)) {
      const cell = JSON.stringify(obj).replace(/"/g, '""');
      rows.push(`${prefix},"${cell}"`);
      return;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      flattenInto(prefix ? `${prefix}.${k}` : k, v);
    }
  }

  if (typeof data === 'object' && !Array.isArray(data)) {
    for (const [section, value] of Object.entries(data)) {
      flattenInto(section, value);
    }
  } else {
    flattenInto('data', data);
  }

  return rows.join('\n');
}

/**
 * Render data as a markdown table.
 * Each top-level key becomes a section heading; leaf values become table rows.
 */
function renderMarkdown(data: Record<string, unknown>, title: string): string {
  const lines: string[] = [`# ${title}`, ''];

  function renderSection(sectionName: string, obj: unknown): void {
    lines.push(`## ${sectionName}`, '');
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      lines.push(`| key | value |`, `| --- | --- |`, `| ${sectionName} | ${JSON.stringify(obj)} |`, '');
      return;
    }
    lines.push('| metric | value |', '| --- | --- |');
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const cell = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
      lines.push(`| ${k} | ${cell} |`);
    }
    lines.push('');
  }

  for (const [section, value] of Object.entries(data)) {
    renderSection(section, value);
  }

  return lines.join('\n');
}

// === Main handler ===

/**
 * Handle the `analytics_export` tool.
 *
 * Exports session data in JSON, CSV, or markdown format.
 *
 * Scopes:
 * - `current`         — Export the live session from the Aggregator.
 * - `historical`      — Export all archived sessions from HistoricalStore.
 * - `session:<id>`    — Export a specific archived session by ID.
 *
 * If `output_path` is provided, the export is written to disk.
 * Otherwise, the content is returned inline in the MCP response.
 *
 * @param aggregator  - The running Aggregator instance.
 * @param input       - Validated AnalyticsExportInput from the MCP tool call.
 * @param store       - HistoricalStore instance for accessing archived sessions.
 * @returns MCP tool response with the exported content or confirmation.
 */
export async function handleExport(
  aggregator: Aggregator,
  input: AnalyticsExportInput,
  store: HistoricalStore,
): Promise<HandlerResponse> {
  try {
    const rawSections = input.sections;
    const sections: SectionKey[] = Array.isArray(rawSections) && rawSections.length > 0
      ? rawSections.filter((s): s is SectionKey => ALL_SECTIONS.includes(s as SectionKey))
      : ALL_SECTIONS;
    let data: Record<string, unknown>;
    let title: string;

    // === Resolve scope ===
    if (input.scope === 'current') {
      const state = aggregator.getState();
      data = extractSections(state, sections);
      title = `Session Export — ${state.session_id}`;
    } else if (input.scope === 'historical' || input.scope === 'all_projects') {
      // Retrieve all archived sessions; filter by tags if specified
      const allArchives = store.list();
      const tags = input.tags ?? [];
      const archives = tags.length > 0
        ? allArchives.filter((a) =>
            tags.some((t) => Array.isArray(a.tags) && a.tags.includes(t)),
          )
        : allArchives;

      if (archives.length === 0) {
        const tagNote = tags.length > 0 ? ` matching tags [${tags.join(', ')}]` : '';
        return {
          content: [{ type: 'text', text: `No historical sessions found${tagNote}.` }],
        };
      }
      const entries: Record<string, unknown> = {};
      for (const archive of archives) {
        entries[archive.session_id] = extractArchiveSections(archive, sections);
      }
      data = entries;
      title = `Historical Export — ${archives.length} sessions`;
    } else {
      // scope = 'session:<id>'
      const sessionId = input.scope.replace(/^session:/, '');
      const archive = store.load(sessionId);
      if (!archive) {
        return {
          content: [{ type: 'text', text: `Session not found: ${sessionId}` }],
        };
      }
      data = extractArchiveSections(archive, sections);
      title = `Session Export — ${archive.tags?.[0] ?? archive.name ?? sessionId}`;
    }

    // === Render format ===
    let rendered: string;
    switch (input.format) {
      case 'json':     rendered = renderJson(data);              break;
      case 'csv':      rendered = renderCsv(data);               break;
      case 'markdown': rendered = renderMarkdown(data, title);   break;
      default: {
        const _exhaustive: never = input.format;
        rendered = renderJson(data);
        void _exhaustive;
      }
    }

    // === Write to disk or return inline ===
    if (input.output_path) {
      const absPath = path.resolve(input.output_path);
      await fs.promises.mkdir(path.dirname(absPath), { recursive: true });
      await fs.promises.writeFile(absPath, rendered, 'utf-8');
      return {
        content: [{
          type: 'text',
          text: `Export written to: ${absPath}\n\nFormat: ${input.format}  Scope: ${input.scope}  Sections: ${sections.join(', ')}`,
        }],
      };
    }

    return {
      content: [{ type: 'text', text: rendered }],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: 'text', text: `analytics_export error: ${message}` }],
    };
  }
}
