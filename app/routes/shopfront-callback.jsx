import { redirect, json } from "@remix-run/node";
import fetch from "node-fetch";
import { prisma } from "../lib/prisma.server"; // 导入Prisma

// 只保留state的内存存储（state是临时的，可以放在内存）
globalThis.shopfrontStates = globalThis.shopfrontStates || {};

function getState(vendor) {
  return globalThis.shopfrontStates[vendor]?.state || null;
}

function deleteState(vendor) {
  if (!globalThis.shopfrontStates[vendor]) return;
  clearTimeout(globalThis.shopfrontStates[vendor].timeout);
  delete globalThis.shopfrontStates[vendor];
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const vendor = url.searchParams.get("vendor") || "plonk";

  console.log("🔄 收到授权回调:", { vendor, hasCode: !!code, hasState: !!state });

  if (!code || !state) {
    console.error("❌ 缺少必要参数");
    return json({ error: "Missing parameters" }, { status: 400 });
  }

  const expectedState = getState(vendor);
  deleteState(vendor);

  if (!expectedState || expectedState !== state) {
    console.error("❌ State验证失败");
    return json({ error: "Invalid state" }, { status: 403 });
  }

  try {
    console.log("📡 向Onshopfront请求token...");
    
    const resp = await fetch("https://onshopfront.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "eXYJMyar5WOhLu67vgU5M1rVgvEYuETa",
        client_secret: "h8gNsZQP8NWIpjfWLV15oME1oCC4m8r1Tp8KcXmr",
        redirect_uri: "https://on-shopfront-sync.vercel.app/shopfront-callback",
        grant_type: "authorization_code",
        code,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("❌ 获取token失败:", resp.status, text);
      return json({ error: text }, { status: resp.status });
    }

    const tokenData = await resp.json();
    console.log("✅ 获取到token数据:", {
      access_token: tokenData.access_token ? "有" : "无",
      refresh_token: tokenData.refresh_token ? "有" : "无",
      expires_in: tokenData.expires_in
    });

    // ✅ 关键修改：保存到数据库而不是内存
    try {
      console.log("💾 保存token到数据库...");
      
      const savedToken = await prisma.shopfrontToken.upsert({
        where: { vendor },
        update: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || "", // 确保不为null
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
      
      console.log("✅ Token保存成功，ID:", savedToken.id);
      
      // 验证保存的数据
      const verifyToken = await prisma.shopfrontToken.findUnique({
        where: { vendor }
      });
      console.log("🔍 验证保存的数据:", {
        id: verifyToken?.id,
        vendor: verifyToken?.vendor,
        has_access: !!verifyToken?.access_token,
        has_refresh: !!verifyToken?.refresh_token
      });
      
    } catch (dbError) {
      console.error("❌ 保存到数据库失败:", dbError.message);
      
      // 如果是表不存在，尝试创建
      if (dbError.message.includes('does not exist') || dbError.message.includes('relation')) {
        console.log("⚠️ 表可能不存在，尝试运行迁移...");
        // 这里可以记录错误，但继续流程
      }
      
      // 即使数据库失败，也暂时保存到内存作为备用
      globalThis.shopfrontTokens = globalThis.shopfrontTokens || {};
      globalThis.shopfrontTokens[vendor] = { ...tokenData, obtainedAt: Date.now() };
      console.log("⚠️ Token已保存到内存（数据库失败）");
    }

    // 授权成功后重定向回首页
    console.log("🎉 授权完成，重定向到首页");
    return redirect("/?authorized=true");

  } catch (err) {
    console.error("❌ 授权流程异常:", err.message);
    return json({ error: err.message }, { status: 500 });
  }
}

// 可选：添加一个action来处理state生成
export async function action({ request }) {
  const formData = await request.formData();
  const vendor = formData.get("vendor") || "plonk";
  
  // 生成随机state
  const state = Math.random().toString(36).substring(2);
  
  // 保存state到内存（10分钟过期）
  globalThis.shopfrontStates[vendor] = {
    state,
    timeout: setTimeout(() => deleteState(vendor), 10 * 60 * 1000)
  };
  
  return json({ state });
}
