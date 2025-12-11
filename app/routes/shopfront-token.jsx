import { json } from "@remix-run/node";
import fetch from "node-fetch";

// 导入数据库连接（需要先创建这个文件）
import { query } from "../lib/db.server.js";

// 从数据库获取token
const getTokensFromDB = async (vendor) => {
  try {
    const result = await query(
      `SELECT access_token, refresh_token, expires_at, created_at 
       FROM "ShopfrontToken" 
       WHERE vendor = $1 
       ORDER BY created_at DESC 
       LIMIT 1`,
      [vendor]
    );
    
    if (result.rows.length === 0) return null;
    
    const row = result.rows[0];
    return {
      access_token: row.access_token,
      refresh_token: row.refresh_token,
      expires_at: row.expires_at,
      created_at: row.created_at
    };
  } catch (error) {
    console.error("数据库查询错误:", error);
    return null;
  }
};

// 保存token到数据库
const storeTokenToDB = async (vendor, tokens) => {
  const { access_token, refresh_token, expires_in } = tokens;
  const expiresAt = new Date(Date.now() + expires_in * 1000);
  
  try {
    // 检查表是否有需要的字段，如果没有先添加
    await query(`
      INSERT INTO "ShopfrontToken" 
      (vendor, access_token, refresh_token, expires_at, created_at)
      VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (vendor) 
      DO UPDATE SET 
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        created_at = NOW()
    `, [vendor, access_token, refresh_token, expiresAt]);
    
    console.log("Token已保存到数据库");
  } catch (error) {
    // 如果表结构问题，尝试修复
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.log("检测到表结构问题，尝试修复...");
      await fixTableStructure();
      // 重新尝试保存
      return storeTokenToDB(vendor, tokens);
    }
    throw error;
  }
};

// 修复表结构（如果需要）
const fixTableStructure = async () => {
  try {
    // 添加缺失的字段
    await query(`
      ALTER TABLE "ShopfrontToken" 
      ADD COLUMN IF NOT EXISTS vendor VARCHAR(100) DEFAULT 'plonk',
      ADD COLUMN IF NOT EXISTS access_token TEXT,
      ADD COLUMN IF NOT EXISTS refresh_token TEXT,
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()
    `);
    console.log("表结构修复完成");
  } catch (error) {
    console.error("修复表结构失败:", error);
  }
};

// 刷新token（更新数据库）
const refreshToken = async (vendor) => {
  const oldTokens = await getTokensFromDB(vendor);
  if (!oldTokens?.refresh_token) {
    throw new Error("没有 refresh_token，无法刷新");
  }

  const resp = await fetch("https://onshopfront.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
      client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2",
      refresh_token: oldTokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("刷新 token 失败: " + txt);
  }

  const newTokens = await resp.json();
  await storeTokenToDB(vendor, newTokens);
  return newTokens;
};

export async function loader({ request }) {
  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "plonk";

  // 从数据库获取token
  let tokens = await getTokensFromDB(vendor);
  
  if (!tokens) {
    return json({ 
      error: "Token not found. 请先完成授权。",
      needs_auth: true 
    }, { status: 401 });
  }

  // 检查token是否过期
  const now = new Date();
  const expiresAt = new Date(tokens.expires_at);
  
  if (now >= expiresAt) {
    try {
      tokens = await refreshToken(vendor);
    } catch (err) {
      return json({ 
        error: err.message,
        needs_auth: true 
      }, { status: 401 });
    }
  }

  return json({
    access_token: tokens.access_token,
    expires_in: Math.floor((expiresAt - now) / 1000)
  });
}
