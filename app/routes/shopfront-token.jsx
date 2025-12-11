// app/routes/shopfront-token.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { prisma } from "../lib/prisma.server"; // 确保这个路径正确

export async function loader({ request }) {
  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "plonk";

  console.log(`🔍 查询token，vendor: ${vendor}`);

  try {
    // 1. 先尝试从数据库获取
    let token = await prisma.shopfrontToken.findUnique({
      where: { vendor }
    });

    // 2. 如果数据库没有，尝试从内存获取（兼容旧版本）
    if (!token) {
      console.log("⚠️ 数据库中没有token，检查内存...");
      const memoryToken = globalThis.shopfrontTokens?.[vendor];
      
      if (memoryToken) {
        console.log("✅ 从内存找到token，迁移到数据库...");
        // 将内存中的token保存到数据库
        token = await prisma.shopfrontToken.upsert({
          where: { vendor },
          update: {
            access_token: memoryToken.access_token,
            refresh_token: memoryToken.refresh_token || "",
            expires_in: memoryToken.expires_in,
            updated_at: new Date()
          },
          create: {
            vendor,
            access_token: memoryToken.access_token,
            refresh_token: memoryToken.refresh_token || "",
            expires_in: memoryToken.expires_in
          }
        });
        // 清理内存中的token
        delete globalThis.shopfrontTokens[vendor];
      }
    }

    if (!token) {
      console.log("❌ 没有找到token");
      return json({ 
        error: "Token not found. 请先完成授权。",
        needs_auth: true 
      }, { status: 401 });
    }

    console.log("✅ 找到token:", {
      id: token.id,
      expires_in: token.expires_in,
      updated_at: token.updated_at
    });

    // 3. 检查是否需要刷新
    const now = Date.now();
    const tokenAge = Math.floor((now - token.updated_at.getTime()) / 1000);
    const isExpired = token.expires_in ? tokenAge > token.expires_in : false;

    if (isExpired && token.refresh_token) {
      console.log("🔄 Token过期，尝试刷新...");
      try {
        const refreshResp = await fetch("https://onshopfront.com/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
            client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2",
            refresh_token: token.refresh_token,
            grant_type: "refresh_token",
          }),
        });

        if (!refreshResp.ok) {
          throw new Error("刷新失败: " + await refreshResp.text());
        }

        const newTokens = await refreshResp.json();
        
        // 更新数据库
        token = await prisma.shopfrontToken.update({
          where: { vendor },
          data: {
            access_token: newTokens.access_token,
            refresh_token: newTokens.refresh_token || token.refresh_token,
            expires_in: newTokens.expires_in,
            updated_at: new Date()
          }
        });
        
        console.log("✅ Token刷新成功");
      } catch (refreshError) {
        console.error("❌ 刷新失败:", refreshError.message);
        // 刷新失败，但可能仍可使用
      }
    }

    return json({
      access_token: token.access_token,
      expires_in: token.expires_in ? token.expires_in - tokenAge : 3600
    });

  } catch (error) {
    console.error("❌ 查询token异常:", error.message);
    return json({ 
      error: "系统错误: " + error.message,
      needs_auth: true 
    }, { status: 500 });
  }
}
