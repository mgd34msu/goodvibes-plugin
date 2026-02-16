import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

export const db = {
  query: async (sql: string, params?: any[]) => {
    const [rows] = await pool.execute(sql, params);
    return rows;
  },
};
