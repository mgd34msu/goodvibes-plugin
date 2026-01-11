/**
 * Unit tests for SQLite schema introspection
 *
 * Tests cover:
 * - Schema types (SqliteColumn, SqliteIndex, SqliteForeignKey, etc.)
 * - Type structure validation
 */

import { describe, it, expect } from 'vitest';
import type {
  SqliteColumn,
  SqliteIndex,
  SqliteForeignKey,
  SqliteTrigger,
  SqliteTableSchema,
  SqliteDatabaseSchema,
} from '../../../handlers/database/sqlite-schema.js';

describe('SQLite Schema Types', () => {
  describe('SqliteColumn', () => {
    it('should have all required properties', () => {
      const column: SqliteColumn = {
        cid: 0,
        name: 'id',
        type: 'INTEGER',
        notnull: true,
        dflt_value: null,
        pk: 1,
      };

      expect(column.cid).toBe(0);
      expect(column.name).toBe('id');
      expect(column.type).toBe('INTEGER');
      expect(column.notnull).toBe(true);
      expect(column.dflt_value).toBeNull();
      expect(column.pk).toBe(1);
    });

    it('should support default values', () => {
      const column: SqliteColumn = {
        cid: 1,
        name: 'status',
        type: 'TEXT',
        notnull: false,
        dflt_value: "'active'",
        pk: 0,
      };

      expect(column.dflt_value).toBe("'active'");
      expect(column.pk).toBe(0);
    });

    it('should support various SQLite types', () => {
      const types = ['INTEGER', 'TEXT', 'REAL', 'BLOB', 'NUMERIC', 'VARCHAR(255)', 'DATETIME'];

      for (const type of types) {
        const column: SqliteColumn = {
          cid: 0,
          name: 'test',
          type,
          notnull: false,
          dflt_value: null,
          pk: 0,
        };
        expect(column.type).toBe(type);
      }
    });
  });

  describe('SqliteIndex', () => {
    it('should have all required properties', () => {
      const index: SqliteIndex = {
        seq: 0,
        name: 'idx_users_email',
        unique: true,
        origin: 'c',
        partial: false,
        columns: ['email'],
      };

      expect(index.seq).toBe(0);
      expect(index.name).toBe('idx_users_email');
      expect(index.unique).toBe(true);
      expect(index.origin).toBe('c');
      expect(index.partial).toBe(false);
      expect(index.columns).toEqual(['email']);
    });

    it('should support composite indexes', () => {
      const index: SqliteIndex = {
        seq: 1,
        name: 'idx_orders_user_date',
        unique: false,
        origin: 'c',
        partial: false,
        columns: ['user_id', 'order_date'],
      };

      expect(index.columns).toHaveLength(2);
      expect(index.columns).toContain('user_id');
      expect(index.columns).toContain('order_date');
    });

    it('should support different index origins', () => {
      const origins: Array<'c' | 'u' | 'pk'> = ['c', 'u', 'pk'];

      for (const origin of origins) {
        const index: SqliteIndex = {
          seq: 0,
          name: 'test_idx',
          unique: origin !== 'c',
          origin,
          partial: false,
          columns: ['col'],
        };
        expect(index.origin).toBe(origin);
      }
    });

    it('should support partial indexes', () => {
      const index: SqliteIndex = {
        seq: 0,
        name: 'idx_active_users',
        unique: false,
        origin: 'c',
        partial: true,
        columns: ['email'],
      };

      expect(index.partial).toBe(true);
    });
  });

  describe('SqliteForeignKey', () => {
    it('should have all required properties', () => {
      const fk: SqliteForeignKey = {
        id: 0,
        seq: 0,
        table: 'users',
        from: 'user_id',
        to: 'id',
        on_update: 'NO ACTION',
        on_delete: 'CASCADE',
        match: 'NONE',
      };

      expect(fk.id).toBe(0);
      expect(fk.seq).toBe(0);
      expect(fk.table).toBe('users');
      expect(fk.from).toBe('user_id');
      expect(fk.to).toBe('id');
      expect(fk.on_update).toBe('NO ACTION');
      expect(fk.on_delete).toBe('CASCADE');
      expect(fk.match).toBe('NONE');
    });

    it('should support different on_update actions', () => {
      const actions = ['NO ACTION', 'RESTRICT', 'SET NULL', 'SET DEFAULT', 'CASCADE'];

      for (const action of actions) {
        const fk: SqliteForeignKey = {
          id: 0,
          seq: 0,
          table: 'parent',
          from: 'parent_id',
          to: 'id',
          on_update: action,
          on_delete: 'NO ACTION',
          match: 'NONE',
        };
        expect(fk.on_update).toBe(action);
      }
    });

    it('should support composite foreign keys', () => {
      // First column of composite FK
      const fk1: SqliteForeignKey = {
        id: 0,
        seq: 0,
        table: 'parent',
        from: 'parent_id1',
        to: 'id1',
        on_update: 'NO ACTION',
        on_delete: 'NO ACTION',
        match: 'NONE',
      };

      // Second column of composite FK
      const fk2: SqliteForeignKey = {
        id: 0,
        seq: 1,
        table: 'parent',
        from: 'parent_id2',
        to: 'id2',
        on_update: 'NO ACTION',
        on_delete: 'NO ACTION',
        match: 'NONE',
      };

      expect(fk1.id).toBe(fk2.id);
      expect(fk1.seq).toBe(0);
      expect(fk2.seq).toBe(1);
    });
  });

  describe('SqliteTrigger', () => {
    it('should have all required properties', () => {
      const trigger: SqliteTrigger = {
        name: 'trg_users_updated',
        type: 'trigger',
        table: 'users',
        sql: 'CREATE TRIGGER trg_users_updated AFTER UPDATE ON users BEGIN UPDATE users SET updated_at = datetime("now") WHERE id = NEW.id; END',
      };

      expect(trigger.name).toBe('trg_users_updated');
      expect(trigger.type).toBe('trigger');
      expect(trigger.table).toBe('users');
      expect(trigger.sql).toContain('CREATE TRIGGER');
    });
  });

  describe('SqliteTableSchema', () => {
    it('should have all required properties', () => {
      const table: SqliteTableSchema = {
        name: 'users',
        type: 'table',
        columns: [
          { cid: 0, name: 'id', type: 'INTEGER', notnull: true, dflt_value: null, pk: 1 },
          { cid: 1, name: 'name', type: 'TEXT', notnull: false, dflt_value: null, pk: 0 },
        ],
        indexes: [],
        foreign_keys: [],
        triggers: [],
        sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)',
      };

      expect(table.name).toBe('users');
      expect(table.type).toBe('table');
      expect(table.columns).toHaveLength(2);
      expect(table.sql).toContain('CREATE TABLE');
    });

    it('should support views', () => {
      const view: SqliteTableSchema = {
        name: 'active_users',
        type: 'view',
        columns: [
          { cid: 0, name: 'id', type: 'INTEGER', notnull: true, dflt_value: null, pk: 0 },
          { cid: 1, name: 'name', type: 'TEXT', notnull: false, dflt_value: null, pk: 0 },
        ],
        indexes: [],
        foreign_keys: [],
        triggers: [],
        sql: 'CREATE VIEW active_users AS SELECT id, name FROM users WHERE active = 1',
      };

      expect(view.type).toBe('view');
    });

    it('should support optional row_count', () => {
      const tableWithCount: SqliteTableSchema = {
        name: 'users',
        type: 'table',
        columns: [],
        indexes: [],
        foreign_keys: [],
        triggers: [],
        sql: '',
        row_count: 1000,
      };

      expect(tableWithCount.row_count).toBe(1000);
    });
  });

  describe('SqliteDatabaseSchema', () => {
    it('should have all required properties', () => {
      const schema: SqliteDatabaseSchema = {
        tables: [],
        views: [],
        version: '3.45.0',
      };

      expect(schema.tables).toEqual([]);
      expect(schema.views).toEqual([]);
      expect(schema.version).toBe('3.45.0');
    });

    it('should support optional database stats', () => {
      const schema: SqliteDatabaseSchema = {
        tables: [],
        views: [],
        version: '3.45.0',
        page_count: 100,
        page_size: 4096,
        file_size_bytes: 409600,
      };

      expect(schema.page_count).toBe(100);
      expect(schema.page_size).toBe(4096);
      expect(schema.file_size_bytes).toBe(409600);
    });

    it('should contain tables and views', () => {
      const schema: SqliteDatabaseSchema = {
        tables: [
          {
            name: 'users',
            type: 'table',
            columns: [{ cid: 0, name: 'id', type: 'INTEGER', notnull: true, dflt_value: null, pk: 1 }],
            indexes: [],
            foreign_keys: [],
            triggers: [],
            sql: 'CREATE TABLE users (id INTEGER PRIMARY KEY)',
          },
        ],
        views: [
          {
            name: 'user_names',
            type: 'view',
            columns: [{ cid: 0, name: 'name', type: 'TEXT', notnull: false, dflt_value: null, pk: 0 }],
            indexes: [],
            foreign_keys: [],
            triggers: [],
            sql: 'CREATE VIEW user_names AS SELECT name FROM users',
          },
        ],
        version: '3.45.0',
      };

      expect(schema.tables).toHaveLength(1);
      expect(schema.views).toHaveLength(1);
      expect(schema.tables[0].name).toBe('users');
      expect(schema.views[0].name).toBe('user_names');
    });
  });
});
