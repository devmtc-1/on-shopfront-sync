// app/routes/webhooks.shopfront.jsx
import { json } from "@remix-run/node";
import { importProductToShopify, findShopifyProductBySFID, shopifyRequest } from "../utils/importProductToShopify";
import { getTokens } from "../utils/shopfrontTokens.server"; // 导入getTokens
import fetch from "node-fetch";

export async function action({ request }) {
  console.log("🔄 收到Webhook请求", new Date().toISOString());
  
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("X-Shopfront-Signature");
    const signatureTime = request.headers.get("X-Shopfront-Signature-Time");

    // 验证Webhook签名
    if (!verifyWebhookSignature(body, signature, signatureTime)) {
      console.error("❌ Webhook签名验证失败");
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(body);
    console.log(`📨 收到Webhook事件:`, {
      event: data.event,
      id: data.id || data.payload?.id,
      时间: new Date().toISOString()
    });

    // 同时支持两种事件名格式
    switch (data.event) {
      case "PRODUCT_CREATED":
      case "product-created":
        await handleProductSync(data.payload);
        break;
      
      case "PRODUCT_UPDATED":
      case "product-updated":
        await handleProductSync(data.payload);
        break;
      
      case "PRODUCT_DELETED":
      case "product-deleted":
        await handleProductDelete(data.payload);
        break;
      
      default:
        console.log(`ℹ️ 忽略未知事件: ${data.event}`);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("❌ Webhook处理错误:", error);
    // 返回200避免Webhook重试
    return new Response(null, { status: 200 });
  }
}

// Webhook签名验证
function verifyWebhookSignature(payload, signature, timestamp) {
  // 待实现：根据Onshopfront文档实现HMAC验证
  console.log("⚠️ Webhook签名验证暂未实现");
  return true;
}

// 从Onshopfront获取单个产品的完整数据
async function getProductFromOnshopfront(productId) {
  console.log("🔍 [getProductFromOnshopfront] 开始，产品ID:", productId);
  
  const vendor = "plonk";
  console.log("🔑 调用 getTokens...");
  
  const tokens = await getTokens(vendor); // ✅ 关键修复：添加 await
  
  console.log("📊 getTokens 结果:", {
    获取到token: !!tokens,
    access_token长度: tokens?.access_token?.length,
    expires_in: tokens?.expires_in,
    时间: new Date().toISOString()
  });
  
  if (!tokens?.access_token) {
    console.error("❌ 错误：没有有效的access_token");
    console.log("完整token对象:", tokens);
    throw new Error("请先完成Onshopfront授权");
  }

  console.log("✅ 获取到有效token，开始查询产品...");

  const query = `
    {
      product(id: "${productId}") {
        id
        name
        description
        status
        type
        category { id name }
        brand { id name }
        image
        alternateImages
        prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
        barcodes { code quantity lastSoldAt promotionPrice outletPromotionPrices { outlet { id name } price } }
        inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel reorderAmount maxQuantity }
      }
    }
  `;

  console.log(`🌐 查询产品 ${productId}...`);
  
  const response = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ query })
  });

  console.log(`📊 API响应状态: ${response.status}`);
  
  const text = await response.text();
  let data;
  
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("❌ JSON解析失败:", text.substring(0, 500));
    throw new Error(`GraphQL返回非JSON: ${text.substring(0, 200)}`);
  }

  if (data.errors) {
    console.error("❌ GraphQL错误:", data.errors);
    throw new Error(`GraphQL查询错误: ${data.errors[0].message}`);
  }

  if (!data.data || !data.data.product) {
    console.error("❌ 未找到产品数据:", data);
    throw new Error("未找到产品数据");
  }

  console.log(`✅ 成功获取产品: ${data.data.product.name}`);
  return data.data.product;
}

// 处理产品同步
async function handleProductSync(webhookData) {
  console.log("🔄 [handleProductSync] 开始");
  
  try {
    // 从webhook数据中获取产品ID
    const productId = webhookData.id;
    if (!productId) {
      console.error("❌ Webhook数据中找不到产品ID:", webhookData);
      return;
    }

    console.log(`📥 处理产品ID: ${productId}`);
    
    // 先获取token，确保有效
    const vendor = "plonk";
    const tokens = await getTokens(vendor);
    
    if (!tokens?.access_token) {
      console.error("❌ Webhook处理失败：没有有效token");
      // 可以在这里发送通知
      return;
    }
    
    console.log(`✅ 获取到有效token，长度: ${tokens.access_token.length}`);
    
    const productData = await getProductFromOnshopfront(productId);
    
    console.log(`🔄 同步产品到Shopify: ${productData.name}`);
    const result = await importProductToShopify(productData);
    
    if (result.skipped) {
      console.log(`⏭️ 跳过产品: ${productData.name} - ${result.reason}`);
    } else if (result.archived) {
      console.log(`📦 归档产品: ${productData.name}`);
    } else {
      console.log(`✅ 成功同步产品: ${productData.name}`, {
        shopifyId: result.shopifyId,
        变体数量: result.variants?.length
      });
    }
  } catch (error) {
    console.error(`❌ Webhook同步产品失败:`, error.message);
    // 不抛出错误，避免Webhook重试
    console.error("完整错误:", error);
  }
}

// 处理产品删除（保持不变）
async function handleProductDelete(webhookData) {
  // ... 保持不变
}
