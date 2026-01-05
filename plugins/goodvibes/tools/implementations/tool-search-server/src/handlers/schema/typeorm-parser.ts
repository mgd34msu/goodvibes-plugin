/**
 * TypeORM schema parser
 */

import * as fs from 'fs';
import * as path from 'path';

import { ToolResponse } from '../../types.js';
import { Column, Relation, Table } from './types.js';

/**
 * Parse TypeORM schema
 */
export function parseTypeORMSchema(projectPath: string, filterTables?: string[]): ToolResponse {
  // Look for TypeORM entity files
  const entityPaths = [
    path.join(projectPath, 'src', 'entities'),
    path.join(projectPath, 'src', 'entity'),
    path.join(projectPath, 'entities'),
    path.join(projectPath, 'entity'),
  ];

  let entityDir: string | null = null;
  for (const p of entityPaths) {
    if (fs.existsSync(p)) {
      entityDir = p;
      break;
    }
  }

  if (!entityDir) {
    throw new Error('TypeORM entities not found. Checked: src/entities, src/entity, entities, entity');
  }

  const tables: Table[] = [];
  const entityFiles = fs.readdirSync(entityDir).filter(f => f.endsWith('.ts') || f.endsWith('.js'));

  for (const file of entityFiles) {
    const content = fs.readFileSync(path.join(entityDir, file), 'utf-8');

    // Parse @Entity decorator
    const entityMatch = content.match(/@Entity\s*\(\s*['"]?(\w+)?['"]?\s*\)/);
    if (!entityMatch) continue;

    // Parse class name
    const classMatch = content.match(/class\s+(\w+)/);
    if (!classMatch) continue;

    const tableName = entityMatch[1] || classMatch[1].toLowerCase();
    const className = classMatch[1];

    if (filterTables?.length && !filterTables.includes(tableName) && !filterTables.includes(className)) continue;

    const columns: Column[] = [];
    const relations: Relation[] = [];

    // Parse @Column decorators
    const columnRegex = /@(PrimaryGeneratedColumn|PrimaryColumn|Column)\s*\(([^)]*)\)\s*\n\s*(\w+)\s*[?!]?\s*:\s*(\w+)/g;
    let colMatch;

    while ((colMatch = columnRegex.exec(content)) !== null) {
      const [, decorator, options, colName, colType] = colMatch;
      columns.push({
        name: colName,
        type: colType,
        nullable: options.includes('nullable: true'),
        primary: decorator.includes('Primary'),
        unique: options.includes('unique: true'),
      });
    }

    // Parse relation decorators
    const relRegex = /@(OneToOne|OneToMany|ManyToOne|ManyToMany)\s*\(\s*\(\)\s*=>\s*(\w+)/g;
    let relMatch;

    while ((relMatch = relRegex.exec(content)) !== null) {
      const [, relType, target] = relMatch;
      relations.push({
        target,
        type: relType.replace(/([A-Z])/g, '-$1').toLowerCase().slice(1),
      });
    }

    tables.push({
      name: tableName,
      entity: className,
      columns,
      relations,
      indexes: [],
      file,
    });
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ source: 'typeorm', tables, entity_dir: entityDir }, null, 2),
    }],
  };
}
