import mysql from 'mysql2/promise';
import { logger } from './logger';

// Validate environment variables
/* c8 ignore start */
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS || !process.env.DB_NAME) {
  throw new Error('Missing required database environment variables');
}
/* c8 ignore stop */

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const db = {
  query: async <T = any>(sql: string, params?: any[]): Promise<T> => {
    try {
      const [rows] = await pool.execute(sql, params);
      return rows as T;
    } catch (error) {
      logger.error('Database query error', {
        method: 'QUERY',
        path: sql,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  },
};
