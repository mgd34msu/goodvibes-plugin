/**
 * Custom Workflow Loader
 *
 * Loads user-defined workflow definitions from the `runtime.workflows`
 * section of goodvibes.json. Validates structural integrity before
 * returning definitions to be registered with the WorkflowEngine.
 *
 * Validation rules:
 * - id must be a non-empty string
 * - id must not use the `builtin_` prefix (reserved for built-in definitions)
 * - initial_state must be present in the states map
 * - every terminal_state must be present in the states map
 * - every transition target must be present in the states map
 */

import { promises as fsPromises, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createLogger } from '../../shared/logger.js';
import type { WorkflowDefinition } from '../types.js';

const log = createLogger('custom-loader');

/**
 * Type guard that checks whether an unknown value is a structurally valid
 * WorkflowDefinition (has non-empty string id, name, numeric version,
 * object states, string initial_state, and array terminal_states).
 *
 * @param obj - The value to check.
 * @returns True if the object satisfies the WorkflowDefinition shape.
 */
export function isValidWorkflowDefinition(obj: unknown): obj is WorkflowDefinition {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return false;
  const d = obj as Record<string, unknown>;
  return (
    typeof d['id'] === 'string' && d['id'].length > 0 &&
    typeof d['name'] === 'string' && d['name'].length > 0 &&
    typeof d['version'] === 'number' &&
    typeof d['states'] === 'object' && d['states'] !== null && !Array.isArray(d['states']) &&
    typeof d['initial_state'] === 'string' && d['initial_state'].length > 0 &&
    Array.isArray(d['terminal_states'])
  );
}

/**
 * Validates a candidate workflow definition object.
 *
 * @param def - The unknown object to validate.
 * @returns An array of validation error strings. Empty array means valid.
 */
export function validateWorkflowDefinition(def: unknown): string[] {
  const errors: string[] = [];

  if (typeof def !== 'object' || def === null || Array.isArray(def)) {
    return ['definition must be a non-null object'];
  }

  const d = def as Record<string, unknown>;

  // id
  if (typeof d['id'] !== 'string' || d['id'].length === 0) {
    errors.push('id must be a non-empty string');
  } else if ((d['id'] as string).startsWith('builtin_')) {
    errors.push(`id "${d['id']}" must not use the reserved "builtin_" prefix`);
  }

  // name
  if (typeof d['name'] !== 'string' || d['name'].length === 0) {
    errors.push('name must be a non-empty string');
  }

  // version
  if (typeof d['version'] !== 'number') {
    errors.push('version must be a number');
  }

  // states
  if (typeof d['states'] !== 'object' || d['states'] === null || Array.isArray(d['states'])) {
    errors.push('states must be a non-null object map');
    // Cannot validate state-referencing fields without a valid states map
    return errors;
  }

  const states = d['states'] as Record<string, unknown>;
  const stateNames = new Set(Object.keys(states));

  // initial_state
  if (typeof d['initial_state'] !== 'string' || d['initial_state'].length === 0) {
    errors.push('initial_state must be a non-empty string');
  } else if (!stateNames.has(d['initial_state'] as string)) {
    errors.push(`initial_state "${d['initial_state']}" is not present in states`);
  }

  // terminal_states
  if (!Array.isArray(d['terminal_states'])) {
    errors.push('terminal_states must be an array');
  } else {
    for (const ts of d['terminal_states'] as unknown[]) {
      if (typeof ts !== 'string') {
        errors.push(`terminal_states entry "${String(ts)}" must be a string`);
      } else if (!stateNames.has(ts)) {
        errors.push(`terminal_state "${ts}" is not present in states`);
      }
    }
  }

  // Validate transition targets
  for (const [stateName, stateDef] of Object.entries(states)) {
    if (typeof stateDef !== 'object' || stateDef === null) {
      errors.push(`state "${stateName}" must be an object`);
      continue;
    }
    const sd = stateDef as Record<string, unknown>;
    if (!Array.isArray(sd['transitions'])) {
      errors.push(`state "${stateName}" must have a transitions array`);
      continue;
    }
    for (const transition of sd['transitions'] as unknown[]) {
      if (typeof transition !== 'object' || transition === null) {
        errors.push(`state "${stateName}" has a non-object transition`);
        continue;
      }
      const t = transition as Record<string, unknown>;
      if (typeof t['target'] !== 'string' || t['target'].length === 0) {
        errors.push(`state "${stateName}" has a transition with missing or empty target`);
      } else if (!stateNames.has(t['target'] as string)) {
        errors.push(`state "${stateName}" transition target "${t['target']}" is not present in states`);
      }
    }
  }

  return errors;
}

/**
 * Loads custom workflow definitions from the `runtime.workflows` array
 * in goodvibes.json located at `configPath`.
 *
 * Invalid definitions are logged as warnings and skipped.
 *
 * @param configPath - Absolute path to the project root (goodvibes.json is expected there).
 * @returns Array of validated WorkflowDefinition objects.
 */
export async function loadCustomWorkflows(configPath: string): Promise<WorkflowDefinition[]> {
  const configFile = join(configPath, 'goodvibes.json');

  // existsSync is a fast stat call used as a guard before async reads — acceptable pattern
  if (!existsSync(configFile)) {
    log.debug('loadCustomWorkflows: no goodvibes.json found, skipping custom workflow loading', {
      config_file: configFile,
    });
    return [];
  }

  let raw: string;
  try {
    raw = await fsPromises.readFile(configFile, 'utf-8');
  } catch (err) {
    log.warn('loadCustomWorkflows: failed to read goodvibes.json', {
      config_file: configFile,
      error: String(err),
    });
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    log.warn('loadCustomWorkflows: failed to parse goodvibes.json as JSON', {
      config_file: configFile,
      error: String(err),
    });
    return [];
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    log.warn('loadCustomWorkflows: goodvibes.json root must be an object');
    return [];
  }

  const root = parsed as Record<string, unknown>;
  const runtimeSection = root['runtime'];
  if (typeof runtimeSection !== 'object' || runtimeSection === null) {
    log.debug('loadCustomWorkflows: no "runtime" section in goodvibes.json');
    return [];
  }

  const workflowsArray = (runtimeSection as Record<string, unknown>)['workflows'];
  if (!Array.isArray(workflowsArray)) {
    log.debug('loadCustomWorkflows: no "runtime.workflows" array in goodvibes.json');
    return [];
  }

  const definitions: WorkflowDefinition[] = [];

  for (const candidate of workflowsArray) {
    const errors = validateWorkflowDefinition(candidate);
    if (errors.length > 0) {
      log.warn('loadCustomWorkflows: skipping invalid workflow definition', {
        errors,
        candidate_id:
          typeof (candidate as Record<string, unknown>)?.['id'] === 'string'
            ? (candidate as Record<string, unknown>)['id']
            : '<unknown>',
      });
      continue;
    }
    definitions.push(candidate as WorkflowDefinition);
    log.info('loadCustomWorkflows: loaded custom workflow definition', {
      id: (candidate as WorkflowDefinition).id,
      name: (candidate as WorkflowDefinition).name,
    });
  }

  log.debug('loadCustomWorkflows: loaded custom workflows', {
    count: definitions.length,
    total_candidates: workflowsArray.length,
  });

  return definitions;
}
