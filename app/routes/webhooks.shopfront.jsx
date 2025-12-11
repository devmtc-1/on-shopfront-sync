// app/routes/webhooks.shopfront.jsx
import { json } from "@remix-run/node";
import { importProductToShopify, findShopifyProductBySFID, shopifyRequest } from "../utils/importProductToShopify";
import { getTokens } from "../utils/shopfrontTokens.server"; // 导入getTokens
import fetch from "node-fetch";

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    const body = await request.text();
    const signature = request.headers.get("X-Shopfront-Signature");
    const signatureTime = request.headers.get("X-Shopfront-Signature-Time");

    // 验证Webhook签名
    if (!verifyWebhookSignature(body, signature, signatureTime)) {
      console.error("Webhook签名验证失败");
      return json({ error: "Invalid signature" }, { status: 401 });
    }

    const data = JSON.parse(body);
    console.log(`📨 收到Webhook: ${data.event}`, { id: data.id });

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
        console.log(`忽略未知事件: ${data.event}`);
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Webhook处理错误:", error);
    return json({ error: "Processing failed" }, { status: 500 });
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
  const vendor = "plonk";
  const tokens = await getTokens(vendor);
  
  if (!tokens?.access_token) {
    throw new Error("请先完成Onshopfront授权");
  }

const query = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      description
      status
      type
      category { id name }
      brand { id name }
      tags { id name }
      image
      alternateImages
      createdAt
      updatedAt
      prices { 
        quantity 
        price 
        priceEx 
        decimalPlaceLength 
        priceSet { id name } 
      }
      barcodes { 
        code 
        quantity 
        lastSoldAt 
        promotionPrice 
        outletPromotionPrices { 
          outlet { id name } 
          price 
        } 
      }
      inventory { 
        outlet { id name } 
        quantity 
        singleLevel 
        caseLevel 
        reorderLevel 
        reorderAmount 
        maxQuantity 
      }
      additionalFields {
        id
        name
        safeName
        type
        value
      }
    }
  }
`;

  const response = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({ query })
  });

  const text = await response.text();
  let data;
  
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new Error(`GraphQL返回非JSON: ${text}`);
  }

  if (data.errors) {
    throw new Error(`GraphQL查询错误: ${data.errors[0].message}`);
  }

  if (!data.data || !data.data.product) {
    throw new Error("未找到产品数据");
  }

  return data.data.product;
}

// 处理产品同步
async function handleProductSync(webhookData) {
  try {
    // 从webhook数据中获取产品ID
    const productId = webhookData.id;
    if (!productId) {
      console.error("❌ Webhook数据中找不到产品ID");
      return;
    }

    console.log(`🔄 Webhook获取产品完整数据: ${productId}`);
    const productData = await getProductFromOnshopfront(productId);
    
    console.log(`🔄 Webhook同步产品: ${productData.name}`);
    const result = await importProductToShopify(productData);
    
    if (result.skipped) {
      console.log(`⏭️ 跳过产品: ${productData.name} - ${result.reason}`);
    } else if (result.archived) {
      console.log(`📦 归档产品: ${productData.name}`);
    } else {
      console.log(`✅ 成功同步产品: ${productData.name}`);
    }
  } catch (error) {
    console.error(`❌ Webhook同步产品失败:`, error);
    throw error;
  }
}

// 处理产品删除
async function handleProductDelete(webhookData) {
  try {
    // 从webhook数据中获取产品ID
    const productId = webhookData.id;
    if (!productId) {
      console.error("❌ Webhook数据中找不到产品ID");
      return;
    }

    console.log(`🗑️  Webhook处理产品删除: ${productId}`);
    
    // 直接使用产品ID查找Shopify产品
    const existing = await findShopifyProductBySFID(productId);
    if (!existing) {
      console.log(`ℹ️  Shopify中未找到产品: ${productId}`);
      return;
    }

    // 在Shopify中归档产品
    const updatePayload = {
      product: {
        id: existing.id,
        status: "archived"
      }
    };

    await shopifyRequest(`products/${existing.id}.json`, "PUT", updatePayload);
    console.log(`✅ Webhook成功归档产品: ${existing.id}`);
    
  } catch (error) {
    console.error(`❌ Webhook删除产品失败:`, error);
    throw error;
  }
}
