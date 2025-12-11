import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { prisma } from "../lib/prisma.server";

// 从数据库获取token
const getTokensFromDB = async (vendor) => {
  try {
    const token = await prisma.shopfrontToken.findUnique({
      where: { vendor }
    });
    
    if (!token) {
      console.log(`❌ 数据库中没有找到vendor为"${vendor}"的token`);
      return null;
    }
    
    console.log(`✅ 从数据库获取到token，过期时间: ${token.expires_in}`);
    return token;
    
  } catch (error) {
    console.error("❌ 数据库查询错误:", error.message);
    
    // 如果表不存在，创建它
    if (error.message.includes('does not exist') || error.message.includes('relation')) {
      console.log('⚠️ 表可能不存在，尝试运行 Prisma 迁移...');
      // 这里可以触发迁移，或者返回null让用户重新授权
    }
    
    return null;
  }
};

// 保存token到数据库
const storeTokenToDB = async (vendor, tokens) => {
  const { access_token, refresh_token, expires_in } = tokens;
  
  try {
    console.log(`💾 保存token到数据库，vendor: ${vendor}`);
    
    const token = await prisma.shopfrontToken.upsert({
      where: { vendor },
      update: {
        access_token,
        refresh_token,
        expires_in,
        updated_at: new Date()
      },
      create: {
        vendor,
        access_token,
        refresh_token,
        expires_in
      }
    });
    
    console.log(`✅ Token保存成功，ID: ${token.id}`);
    return token;
    
  } catch (error) {
    console.error("❌ 保存token失败:", error.message);
    
    // 如果是字段不匹配错误，可能需要更新schema
    if (error.message.includes('Unknown argument') || error.message.includes('Field')) {
      console.log('⚠️ 模型字段可能不匹配，检查schema...');
    }
    
    throw error;
  }
};

// 刷新token
const refreshToken = async (vendor) => {
  console.log(`🔄 刷新token，vendor: ${vendor}`);
  
  const oldToken = await getTokensFromDB(vendor);
  
  if (!oldToken?.refresh_token) {
    throw new Error("没有 refresh_token，无法刷新");
  }

  const resp = await fetch("https://onshopfront.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
      client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2",
      refresh_token: oldToken.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("刷新 token 失败: " + txt);
  }

  const newTokens = await resp.json();
  console.log('✅ 新token获取成功');
  
  await storeTokenToDB(vendor, newTokens);
  return newTokens;
};

export async function loader({ request }) {
  console.log('📨 收到 /shopfront-token 请求');
  
  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "plonk";
  
  console.log(`🔍 查询vendor: ${vendor}`);

  // 从数据库获取token
  let token = await getTokensFromDB(vendor);
  
  if (!token) {
    console.log('❌ 数据库中没有token，返回401');
    return json({ 
      error: "Token not found. 请先完成授权。",
      needs_auth: true 
    }, { status: 401 });
  }

  // 检查token是否过期
  // 注意：你的schema中 expires_in 是秒数，不是时间戳
  const now = Date.now();
  const tokenAge = Math.floor((now - token.updated_at.getTime()) / 1000);
  const isExpired = token.expires_in ? tokenAge > token.expires_in : false;
  
  console.log('🔍 Token状态检查:', {
    tokenAge: `${tokenAge}秒`,
    expires_in: token.expires_in ? `${token.expires_in}秒` : '未设置',
    isExpired
  });

  if (isExpired) {
    console.log('⚠️ Token已过期，尝试刷新...');
    try {
      const newTokens = await refreshToken(vendor);
      token = { ...token, ...newTokens };
    } catch (err) {
      console.error('❌ 刷新token失败:', err.message);
      return json({ 
        error: err.message,
        needs_auth: true 
      }, { status: 401 });
    }
  }

  console.log('✅ 返回有效的token');
  return json({
    access_token: token.access_token,
    expires_in: token.expires_in ? token.expires_in - tokenAge : 3600
  });
}
