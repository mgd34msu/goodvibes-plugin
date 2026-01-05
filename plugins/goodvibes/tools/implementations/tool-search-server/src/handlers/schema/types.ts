/**
 * Types for schema parsing handlers
 */

import { ToolResponse } from '../../types.js';

export interface GetSchemaArgs {
  source: string;
  path?: string;
  tables?: string[];
}

export interface Column {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
  unique: boolean;
  default?: string | null;
  auto_increment?: boolean;
}

export interface Relation {
  field?: string;
  column?: string;
  target: string;
  targetColumn?: string;
  type: string;
}

export interface Index {
  type: string;
  columns: string[];
}

export interface Table {
  name: string;
  entity?: string;
  variable?: string;
  columns: Column[];
  relations: Relation[];
  indexes: Index[];
  file?: string;
}

/** Parser function signature for schema sources */
export type SchemaParser = (projectPath: string, filterTables?: string[]) => ToolResponse;
