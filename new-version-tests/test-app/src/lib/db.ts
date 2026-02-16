import mysql from 'mysql2/promise';

// Validate environment variables
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASS || !process.env.DB_NAME) {
  throw new Error('Missing required database environment variables');
}

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
      console.error('Database query error:', error);
      throw error;
    }
  },
};
