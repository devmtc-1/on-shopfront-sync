// app/utils/webhookMaintenance.server.js
import { getTokens } from "./shopfrontTokens.server";

/**
 * 智能Webhook维护：检查并修复失效的Webhook
 * 使用与 registerShopfrontWebhooks 相同的API
 */
export async function maintainWebhooks() {
  console.log("🔧 开始Webhook维护检查...", new Date().toISOString());
  
  try {
    const vendor = "plonk";
    
    // 1. 获取token（使用你原来的getTokens函数）
    const tokens = await getTokens(vendor);
    
    if (!tokens?.access_token) {
      console.log("❌ 没有有效token，跳过维护");
      return { 
        success: false, 
        reason: "no_valid_token",
        action: "skipped" 
      };
    }
    
    console.log("✅ 获取到有效token");
    
    // 2. 先获取已注册的Webhook列表
    const existingWebhooks = await getExistingWebhooks(tokens.access_token);
    
    if (existingWebhooks.length === 0) {
      console.log("📭 没有已注册的Webhook，跳过维护");
      return { 
        success: true, 
        action: "none", 
        reason: "no_webhooks_found" 
      };
    }
    
    console.log(`📋 找到 ${existingWebhooks.length} 个已注册Webhook`);
    
    // 3. 只维护你的应用的Webhook（根据URL识别）
    const myWebhookUrl = "https://on-shopfront-sync.vercel.app/webhooks/shopfront";
    const myWebhooks = existingWebhooks.filter(hook => 
      hook.url === myWebhookUrl || 
      hook.url.includes("on-shopfront-sync.vercel.app")
    );
    
    if (myWebhooks.length === 0) {
      console.log("📭 没有找到本应用的Webhook，跳过维护");
      return { 
        success: true, 
        action: "none", 
        reason: "no_my_webhooks" 
      };
    }
    
    console.log(`🎯 找到 ${myWebhooks.length} 个本应用的Webhook，开始维护`);
    
    let repairedCount = 0;
    let healthyCount = 0;
    
    // 4. 检查每个Webhook的健康状态
    for (const webhook of myWebhooks) {
      console.log(`🔍 检查Webhook: ${webhook.name} (${webhook.events.join(", ")})`);
      
      const isHealthy = webhook.active === true; // 使用GraphQL返回的active字段
      
      if (!isHealthy) {
        console.log(`⚠️ Webhook失效: ${webhook.name}，尝试修复...`);
        
        try {
          // 先删除失效的
          await deleteWebhook(webhook.id, tokens.access_token);
          
          // 重新注册（使用你原来的registerWebhook函数）
          await registerSingleWebhook(
            webhook.events[0], // 取第一个事件
            webhook.url,
            tokens.access_token
          );
          
          console.log(`✅ 修复成功: ${webhook.name}`);
          repairedCount++;
          
        } catch (error) {
          console.error(`❌ 修复失败 ${webhook.name}:`, error.message);
        }
        
      } else {
        console.log(`✅ 状态正常: ${webhook.name}`);
        healthyCount++;
      }
    }
    
    const result = {
      success: true,
      action: "maintained",
      total: myWebhooks.length,
      healthy: healthyCount,
      repaired: repairedCount,
      timestamp: new Date().toISOString()
    };
    
    console.log("🎯 维护完成:", result);
    return result;
    
  } catch (error) {
    console.error("❌ Webhook维护失败:", error);
    return { 
      success: false, 
      error: error.message,
      action: "failed" 
    };
  }
}

/**
 * 获取已注册的Webhook列表 - 使用GraphQL
 */
async function getExistingWebhooks(accessToken) {
  try {
    console.log(`📥 获取Webhook列表...`);
    
    const query = `
      query GetWebhooks {
        webhooks {
          id
          name
          url
          events
          active
          createdAt
          updatedAt
        }
      }
    `;
    
    const response = await fetch(`https://plonk.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query })
    });
    
    if (!response.ok) {
      console.log(`⚠️ 获取Webhook列表失败 ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    
    if (data.errors) {
      console.error(`❌ GraphQL错误:`, data.errors);
      return [];
    }
    
    console.log(`✅ 获取到 ${data.data?.webhooks?.length || 0} 个Webhook`);
    return data.data?.webhooks || [];
    
  } catch (error) {
    console.log("⚠️ 获取Webhook列表异常:", error.message);
    return [];
  }
}

/**
 * 删除Webhook - 使用GraphQL
 */
async function deleteWebhook(webhookId, accessToken) {
  console.log(`🗑️ 删除Webhook ${webhookId}...`);
  
  const mutation = `
    mutation DeleteWebhook($id: ID!) {
      deleteWebhook(id: $id) {
        id
        success
      }
    }
  `;
  
  const response = await fetch(`https://plonk.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ 
      query: mutation,
      variables: { id: webhookId }
    })
  });
  
  const data = await response.json();
  
  if (data.errors) {
    console.error(`❌ 删除失败:`, data.errors);
    throw new Error(data.errors[0].message);
  }
  
  return data.data?.deleteWebhook?.success === true;
}

/**
 * 注册单个Webhook - 与你原来的registerWebhook函数保持一致
 */
async function registerSingleWebhook(event, url, accessToken) {
  console.log(`📝 注册 ${event} -> ${url}`);
  
  const mutation = `
    mutation RegisterWebhook {
      registerWebhook(
        name: "${event} Webhook", 
        url: "${url}", 
        events: [${event}]
      ) {
        id
        name
        url
        events
        active
      }
    }
  `;
  
  const response = await fetch(`https://plonk.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation })
  });
  
  const data = await response.json();
  
  if (data.errors) {
    // 如果是"已存在"的错误，也算成功
    const errorMsg = data.errors[0]?.message || '';
    if (errorMsg.includes("already exists") || errorMsg.includes("duplicate")) {
      console.log(`ℹ️ ${event} 已注册`);
      return true;
    }
    
    console.error(`❌ 注册失败 ${event}:`, data.errors);
    throw new Error(`Webhook注册失败: ${data.errors[0].message}`);
  } else {
    console.log(`✅ 注册成功: ${event}`, data.data.registerWebhook);
    return data.data.registerWebhook;
  }
}

/**
 * 兼容你原来的registerShopfrontWebhooks函数
 * 可以导出供其他文件使用
 */
export async function registerShopfrontWebhooks(webhookUrl) {
  const vendor = "plonk";
  const tokens = await getTokens(vendor); // 注意：现在需要await
  
  if (!tokens?.access_token) throw new Error("请先完成授权");
  
  const events = ["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_DELETED"];
  
  console.log(`🚀 手动注册Webhook: ${webhookUrl}`);
  
  for (const event of events) {
    await registerSingleWebhook(event, webhookUrl, tokens.access_token);
  }
  
  console.log("🎉 所有Webhook注册完成");
  return true;
}
