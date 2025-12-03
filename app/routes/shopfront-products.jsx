// app/routes/shopfront-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

// 硬编码的同步设置
const SYNC_CONFIG = {
  START_PAGE: 16,      // 从第16页开始
  END_PAGE: 20,        // 到第20页结束
  PRODUCTS_PER_PAGE: 50, // 每页50个产品
  DELAY_BETWEEN_PAGES: 2000, // 页间延迟2秒
  MAX_RETRIES: 3,      // 最大重试次数
};

// 同步状态
let syncStatus = {
  isRunning: false,
  currentPage: 0,
  totalPages: SYNC_CONFIG.END_PAGE - SYNC_CONFIG.START_PAGE + 1,
  importedCount: 0,
  error: null,
  details: []
};

export async function loader() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);
  
  if (!tokens?.access_token) {
    return json({ error: "请先完成授权" }, { status: 401 });
  }

  // 如果同步已经运行过，返回状态
  if (syncStatus.isRunning || syncStatus.details.length > 0) {
    return json({
      ok: true,
      syncStatus,
      message: syncStatus.isRunning ? "同步进行中..." : "同步已完成"
    });
  }

  // 开始同步
  syncStatus.isRunning = true;
  syncStatus.currentPage = SYNC_CONFIG.START_PAGE - 1;
  syncStatus.details = [];

  console.log(`🚀 开始同步产品: 第${SYNC_CONFIG.START_PAGE}页到第${SYNC_CONFIG.END_PAGE}页`);

  // 异步执行同步，立即返回响应
  setTimeout(() => executeSync(tokens.access_token, vendor), 0);

  return json({
    ok: true,
    syncStatus,
    message: "开始同步第16-20页产品..."
  });
}

// 异步执行同步任务
async function executeSync(accessToken, vendor) {
  try {
    // 1. 先找到第16页的起始cursor
    let currentCursor = null;
    console.log(`🔍 定位第${SYNC_CONFIG.START_PAGE}页起始位置...`);
    
    for (let page = 1; page < SYNC_CONFIG.START_PAGE; page++) {
      try {
        const result = await fetchProductsPage(
          accessToken, 
          vendor, 
          SYNC_CONFIG.PRODUCTS_PER_PAGE, 
          currentCursor
        );
        
        currentCursor = result.nextCursor;
        syncStatus.currentPage = page;
        
        if (!currentCursor) {
          console.log(`⚠️ 在第${page}页后找不到更多产品`);
          break;
        }
        
        console.log(`📍 已定位到第${page}页`);
        
        // 添加小延迟避免速率限制
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`❌ 定位第${page}页失败:`, error.message);
        syncStatus.error = `定位第${page}页失败: ${error.message}`;
        syncStatus.isRunning = false;
        return;
      }
    }

    console.log(`✅ 已找到第${SYNC_CONFIG.START_PAGE}页起始位置`);

    // 2. 同步指定页数范围的产品
    for (let page = SYNC_CONFIG.START_PAGE; page <= SYNC_CONFIG.END_PAGE; page++) {
      syncStatus.currentPage = page;
      
      console.log(`🔄 同步第${page}页产品...`);
      
      try {
        const result = await fetchProductsPage(
          accessToken, 
          vendor, 
          SYNC_CONFIG.PRODUCTS_PER_PAGE, 
          currentCursor
        );

        if (result.products.length > 0) {
          // 导入产品到数据库
          const importedCount = await importProducts(result.products);
          syncStatus.importedCount += importedCount;
          
          syncStatus.details.push({
            page,
            count: result.products.length,
            imported: importedCount,
            success: true,
            timestamp: new Date().toISOString()
          });
          
          console.log(`✅ 第${page}页完成: ${result.products.length}个产品`);
        } else {
          syncStatus.details.push({
            page,
            count: 0,
            imported: 0,
            success: true,
            message: "本页无产品",
            timestamp: new Date().toISOString()
          });
          console.log(`ℹ️ 第${page}页无产品`);
        }

        // 更新cursor用于下一页
        currentCursor = result.nextCursor;

        // 如果不是最后一页，添加延迟
        if (page < SYNC_CONFIG.END_PAGE) {
          console.log(`⏳ 等待${SYNC_CONFIG.DELAY_BETWEEN_PAGES/1000}秒后继续...`);
          await new Promise(resolve => setTimeout(resolve, SYNC_CONFIG.DELAY_BETWEEN_PAGES));
        }

      } catch (error) {
        console.error(`❌ 第${page}页同步失败:`, error.message);
        
        syncStatus.details.push({
          page,
          count: 0,
          imported: 0,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
        
        syncStatus.error = `第${page}页失败: ${error.message}`;
        break;
      }
    }

    // 同步完成
    syncStatus.isRunning = false;
    
    if (!syncStatus.error) {
      console.log(`🎉 同步完成! 共导入${syncStatus.importedCount}个产品`);
      console.log(`📊 详情: 第${SYNC_CONFIG.START_PAGE}-${SYNC_CONFIG.END_PAGE}页`);
    } else {
      console.error(`🛑 同步中止: ${syncStatus.error}`);
    }

  } catch (error) {
    console.error("同步过程出错:", error);
    syncStatus.error = error.message;
    syncStatus.isRunning = false;
  }
}

// 获取单页产品数据（带重试机制）
async function fetchProductsPage(accessToken, vendor, first, after = null) {
  const query = `
    {
      products(first: ${first} ${after ? `, after: "${after}"` : ""}) {
        edges {
          cursor
          node {
            id
            name
            description
            status
            type
            category { id name }
            brand { id name }
            image
            alternateImages
            createdAt
            updatedAt
            prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
            barcodes { code quantity lastSoldAt promotionPrice outletPromotionPrices { outlet { id name } price } }
            inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel reorderAmount maxQuantity }
          }
        }
        pageInfo { 
          hasNextPage 
          endCursor 
        }
      }
    }
  `;

  let retryCount = 0;

  while (retryCount < SYNC_CONFIG.MAX_RETRIES) {
    try {
      const response = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept": "application/json",
          "User-Agent": "Shopfront-App"
        },
        body: JSON.stringify({ query }),
        timeout: 30000
      });

      const text = await response.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error("GraphQL返回非JSON数据");
      }

      // 检查API错误
      if (data.errors) {
        // 处理Throttled错误
        if (data.errors.some(err => err.message === "Throttled")) {
          retryCount++;
          const delay = Math.pow(2, retryCount) * 1000 + Math.random() * 1000;
          console.log(`⏰ 被节流，等待${delay/1000}秒后重试 (${retryCount}/${SYNC_CONFIG.MAX_RETRIES})...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw new Error(data.errors[0]?.message || "GraphQL错误");
      }

      if (!data.data?.products) {
        throw new Error("Shopfront API未返回products字段");
      }

      const edges = data.data.products.edges || [];
      
      return {
        products: edges.map(edge => edge.node),
        nextCursor: data.data.products.pageInfo?.endCursor || null,
        hasNextPage: data.data.products.pageInfo?.hasNextPage || false
      };

    } catch (error) {
      retryCount++;
      
      if (retryCount >= SYNC_CONFIG.MAX_RETRIES) {
        throw new Error(`获取产品失败: ${error.message} (已重试${SYNC_CONFIG.MAX_RETRIES}次)`);
      }
      
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`⚠️ 请求失败，等待${delay/1000}秒后重试 (${retryCount}/${SYNC_CONFIG.MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error("获取产品数据失败");
}

// 导入产品到数据库
async function importProducts(products) {
  console.log(`📥 导入${products.length}个产品到数据库...`);
  
  // TODO: 实现你的数据库导入逻辑
  // 这里是一个示例实现
  
  let successCount = 0;
  const errors = [];
  
  for (const product of products) {
    try {
      // 示例：保存到数据库
      // await db.product.upsert({
      //   where: { shopfrontId: product.id },
      //   update: mapProductData(product),
      //   create: mapProductData(product)
      // });
      
      // 模拟导入成功
      await new Promise(resolve => setTimeout(resolve, 10));
      
      successCount++;
      
    } catch (error) {
      console.error(`导入产品失败 ${product.id}:`, error.message);
      errors.push({
        productId: product.id,
        productName: product.name,
        error: error.message
      });
    }
  }
  
  if (errors.length > 0) {
    console.warn(`⚠️ ${errors.length}个产品导入失败`);
    // 可以在这里记录错误日志
  }
  
  console.log(`✅ 导入完成: ${successCount}个成功, ${errors.length}个失败`);
  
  return successCount;
}

// 辅助函数：映射产品数据（根据你的数据库结构调整）
function mapProductData(shopfrontProduct) {
  return {
    shopfrontId: shopfrontProduct.id,
    name: shopfrontProduct.name,
    description: shopfrontProduct.description || '',
    status: shopfrontProduct.status,
    type: shopfrontProduct.type,
    imageUrl: shopfrontProduct.image || '',
    alternateImages: shopfrontProduct.alternateImages || [],
    createdAt: new Date(shopfrontProduct.createdAt),
    updatedAt: new Date(shopfrontProduct.updatedAt),
    // 其他字段...
  };
}
