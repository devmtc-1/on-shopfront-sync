import pg from 'pg';
const { Pool } = pg;

// 创建数据库连接池
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false,
  max: 10, // 最大连接数
  idleTimeoutMillis: 30000,
});

// 查询函数
export async function query(text, params) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('数据库错误:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// 初始化数据库表（可选）
export async function initDB() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS "ShopfrontToken" (
        id SERIAL PRIMARY KEY,
        vendor VARCHAR(100) DEFAULT 'plonk',
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(vendor)
      )
    `);
    console.log('数据库表初始化完成');
  } catch (error) {
    console.error('数据库初始化失败:', error);
  }
}
