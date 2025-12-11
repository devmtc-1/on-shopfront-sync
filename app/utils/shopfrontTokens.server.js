// app/utils/shopfrontTokens.server.js
import { PrismaClient } from '@prisma/client';

// ==================== Prisma客户端初始化 ====================
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
    });
  }
  prisma = global.prisma;
}

// ==================== 辅助函数 ====================

/**
 * 确保ShopfrontToken表存在
 */
async function ensureTableExists() {
  try {
    // 检查表是否存在
    const tableExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'ShopfrontToken'
      )
    `;
    
    if (!tableExists[0]?.exists) {
      console.log('🔄 创建ShopfrontToken表...');
      
      await prisma.$executeRaw`
        CREATE TABLE "ShopfrontToken" (
          id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
          vendor TEXT UNIQUE NOT NULL,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL DEFAULT '',
          expires_in INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `;
      
      console.log('✅ ShopfrontToken表创建完成');
    }
  } catch (error) {
    console.error('❌ 创建表失败:', error);
  }
}

/**
 * 获取不同vendor的凭证配置
 */
function getCredentialsByVendor(vendor) {
  const credentials = {
    plonk: {
      client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
      client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2"
    },
    default: {
      client_id: "eXYJMyar5WOhLu67vgU5M1rVgvEYuETa",
      client_secret: "h8gNsZQP8NWIpjfWLV15oME1oCC4m8r1Tp8KcXmr"
    }
  };
  
  return credentials[vendor] || credentials.default;
}

// ==================== 主函数（保持原接口不变） ====================

/**
 * 获取token - 从数据库读取（替换原来的内存读取）
 * 接口完全兼容：getTokens(vendor) => { access_token, refresh_token, expires_in, obtainedAt? }
 */
export const getTokens = async (vendor = "plonk") => {
  try {
    console.log(`🔍 [getTokens] 查询数据库，vendor: ${vendor}`);
    
    // 确保表存在
    await ensureTableExists();
    
    // 从数据库查询
    const token = await prisma.shopfrontToken.findUnique({
      where: { vendor }
    });
    
    if (!token) {
      console.log(`❌ [getTokens] 数据库中没有${vendor}的token`);
      
      // 保持兼容：如果没有数据，也检查内存（过渡期）
      const memoryToken = globalThis.shopfrontTokens?.[vendor];
      if (memoryToken) {
        console.log(`⚠️ [getTokens] 从内存找到旧token，迁移到数据库...`);
        await storeAccessToken(vendor, memoryToken);
        // 清理内存
        delete globalThis.shopfrontTokens[vendor];
        // 重新从数据库获取
        return getTokens(vendor);
      }
      
      return null;
    }
    
    console.log(`✅ [getTokens] 找到数据库token:`, {
      id: token.id.substring(0, 8) + '...',
      expires_in: token.expires_in,
      updated: token.updated_at.toISOString()
    });
    
    // 检查是否过期
    const now = new Date();
    const updatedAt = new Date(token.updated_at);
    const ageSeconds = Math.floor((now - updatedAt) / 1000);
    const isExpired = token.expires_in ? ageSeconds > token.expires_in : false;
    
    console.log(`⏰ [getTokens] Token状态:`, {
      年龄: `${ageSeconds}秒`,
      有效期: token.expires_in ? `${token.expires_in}秒` : '未设置',
      已过期: isExpired
    });
    
    // 保持与原接口完全兼容的返回格式
    return {
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in ? token.expires_in - ageSeconds : 3600,
      obtainedAt: updatedAt.getTime() // 原接口有这个字段
    };
    
  } catch (error) {
    console.error(`❌ [getTokens] 查询失败 (vendor: ${vendor}):`, error.message);
    
    // 出错时回退到内存存储（兼容性）
    console.log(`⚠️ [getTokens] 回退到内存存储`);
    return globalThis.shopfrontTokens?.[vendor] || null;
  }
};

/**
 * 保存token - 保存到数据库（替换原来的内存保存）
 * 接口完全兼容：storeAccessToken(vendor, tokenData)
 */
export const storeAccessToken = async (vendor = "plonk", tokenData) => {
  try {
    console.log(`💾 [storeAccessToken] 保存到数据库，vendor: ${vendor}`);
    
    await ensureTableExists();
    
    const savedToken = await prisma.shopfrontToken.upsert({
      where: { vendor },
      update: {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || "",
        expires_in: tokenData.expires_in,
        updated_at: new Date()
      },
      create: {
        vendor,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || "",
        expires_in: tokenData.expires_in
      }
    });
    
    console.log(`✅ [storeAccessToken] 保存成功，ID: ${savedToken.id}`);
    
    // 为了兼容性，同时也保存到内存（可以逐渐移除）
    globalThis.shopfrontTokens = globalThis.shopfrontTokens || {};
    globalThis.shopfrontTokens[vendor] = {
      ...tokenData,
      obtainedAt: Date.now()
    };
    
    return true;
    
  } catch (error) {
    console.error(`❌ [storeAccessToken] 保存失败 (vendor: ${vendor}):`, error);
    
    // 数据库失败时，回退到内存存储
    console.log(`⚠️ [storeAccessToken] 回退到内存存储`);
    globalThis.shopfrontTokens = globalThis.shopfrontTokens || {};
    globalThis.shopfrontTokens[vendor] = {
      ...tokenData,
      obtainedAt: Date.now()
    };
    
    return false;
  }
};

/**
 * 刷新token - 更新版，保存到数据库
 * 接口完全兼容：refreshToken(vendor) => 返回新token
 */
export const refreshToken = async (vendor = "plonk") => {
  console.log(`🔄 [refreshToken] 刷新token，vendor: ${vendor}`);
  
  try {
    // 1. 从数据库获取旧token
    const oldTokens = await getTokens(vendor);
    if (!oldTokens || !oldTokens.refresh_token) {
      throw new Error(`No refresh_token found for vendor ${vendor}`);
    }
    
    console.log(`🔍 [refreshToken] 获取到旧token，准备刷新`);
    
    // 2. 调用API刷新
    const credentials = getCredentialsByVendor(vendor);
    
    const resp = await fetch("https://onshopfront.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        client_id: credentials.client_id,
        client_secret: credentials.client_secret,
        refresh_token: oldTokens.refresh_token,
        grant_type: "refresh_token",
      }),
    });
    
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Unable to refresh access token: ${resp.status} ${text}`);
    }
    
    const newTokens = await resp.json();
    console.log(`✅ [refreshToken] API刷新成功`);
    
    // 3. 保存到数据库
    await storeAccessToken(vendor, newTokens);
    
    console.log(`✔ [refreshToken] Access token refreshed for vendor: ${vendor}`);
    return newTokens;
    
  } catch (error) {
    console.error(`❌ [refreshToken] 刷新失败 (vendor: ${vendor}):`, error.message);
    throw error;
  }
};

/**
 * 新功能：获取有效的access_token（自动处理刷新）
 */
export async function getValidAccessToken(vendor = "plonk") {
  try {
    let tokens = await getTokens(vendor);
    
    if (!tokens) {
      throw new Error(`未找到${vendor}的授权信息`);
    }
    
    // 如果快过期了（剩余时间小于5分钟），尝试刷新
    const timeLeft = tokens.expires_in;
    if (timeLeft < 300 && tokens.refresh_token) { // 5分钟 = 300秒
      console.log(`🔄 [getValidAccessToken] Token即将过期(${timeLeft}秒)，自动刷新`);
      try {
        tokens = await refreshToken(vendor);
      } catch (refreshError) {
        console.error(`❌ [getValidAccessToken] 自动刷新失败:`, refreshError.message);
        // 刷新失败，但可能原来的token还能用一会儿
      }
    }
    
    return tokens.access_token;
    
  } catch (error) {
    console.error(`❌ [getValidAccessToken] 失败:`, error.message);
    throw error;
  }
}

/**
 * 新功能：删除token
 */
export async function deleteTokens(vendor = "plonk") {
  try {
    await prisma.shopfrontToken.delete({
      where: { vendor }
    });
    
    // 同时清理内存
    if (globalThis.shopfrontTokens?.[vendor]) {
      delete globalThis.shopfrontTokens[vendor];
    }
    
    console.log(`✅ [deleteTokens] 已删除${vendor}的token`);
    return true;
  } catch (error) {
    console.error(`❌ [deleteTokens] 删除失败:`, error.message);
    return false;
  }
}

// ==================== 初始化检查 ====================
// 应用启动时检查表
if (typeof window === 'undefined') {
  ensureTableExists().catch(console.error);
}
