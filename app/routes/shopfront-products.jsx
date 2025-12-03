// app/routes/sync-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

// 配置常量 - 在这里修改同步范围
const SYNC_CONFIG = {
  START_PAGE: 1,        // 从第几页开始 (1-120+)
  END_PAGE: 10,         // 到第几页结束
  PRODUCTS_PER_PAGE: 50, // 每页产品数
  DELAY_BETWEEN_PAGES: 1000, // 页间延迟(毫秒)
  MAX_RETRIES: 3,       // 最大重试次数
};

// 同步状态
let syncStatus = {
  isRunning: false,
  totalProducts: 0,
  importedCount: 0,
  currentPage: 0,
  error: null,
  details: []
};

export async function loader() {
  const vendor = "plonk";
  const tokens = getTokens(vendor);
  
  if (!tokens?.access_token) {
    return json({ error: "请先完成授权" }, { status: 401 });
  }

  // 如果同步正在进行，返回状态
  if (syncStatus.isRunning) {
    return json({
      ok: true,
      syncStatus,
      message: "同步进行中..."
    });
  }

  // 开始新的同步
  console.log(`🚀 开始同步产品: 第${SYNC_CONFIG.START_PAGE}页到第${SYNC_CONFIG.END_PAGE}页`);
  
  syncStatus = {
    isRunning: true,
    totalProducts: 0,
    importedCount: 0,
    currentPage: SYNC_CONFIG.START_PAGE,
    error: null,
    details: []
  };

  // 异步执行同步
  executeSync(tokens.access_token, vendor).catch(error => {
    console.error("同步任务出错:", error);
    syncStatus.error = error.message;
    syncStatus.isRunning = false;
  });

  return json({
    ok: true,
    syncStatus,
    message: `开始同步第${SYNC_CONFIG.START_PAGE}-${SYNC_CONFIG.END_PAGE}页产品`
  });
}

// 主同步函数
async function executeSync(accessToken, vendor) {
  try {
    console.log("📊 第一步：获取总产品数...");
    
    // 1. 先获取活跃产品的总数
    const totalCount = await getActiveProductsCount(accessToken, vendor);
    console.log(`📊 活跃产品总数: ${totalCount}`);
    syncStatus.totalProducts = totalCount;
    
    // 2. 计算总页数
    const totalPages = Math.ceil(totalCount / SYNC_CONFIG.PRODUCTS_PER_PAGE);
    console.log(`📊 预计总页数: ${totalPages} (每页${SYNC_CONFIG.PRODUCTS_PER_PAGE}个)`);
    
    // 3. 同步指定页数范围
    let currentCursor = null;
    
    // 如果要跳过分页，需要先找到起始页的cursor
    if (SYNC_CONFIG.START_PAGE > 1) {
      console.log(`🔍 正在定位到第${SYNC_CONFIG.START_PAGE}页...`);
      currentCursor = await findPageCursor(accessToken, vendor, SYNC_CONFIG.START_PAGE);
      console.log(`✅ 已找到起始cursor`);
    }
    
    // 4. 同步指定范围的产品
    for (let page = SYNC_CONFIG.START_PAGE; page <= SYNC_CONFIG.END_PAGE; page++) {
      if (!syncStatus.isRunning) break;
      
      syncStatus.currentPage = page;
      console.log(`🔄 同步第${page}页/${SYNC_CONFIG.END_PAGE}...`);
      
      try {
        const result = await fetchProductsWithCursor(
          accessToken,
          vendor,
          SYNC_CONFIG.PRODUCTS_PER_PAGE,
          currentCursor
        );
        
        if (result.products.length > 0) {
          // 导入产品
          const imported = await importProducts(result.products);
          syncStatus.importedCount += imported;
          
          syncStatus.details.push({
            page,
            fetched: result.products.length,
            imported,
            cursor: currentCursor ? currentCursor.substring(0, 20) + '...' : 'null',
            success: true
          });
          
          console.log(`✅ 第${page}页完成: 获取${result.products.length}个, 导入${imported}个`);
        }
        
        // 更新cursor
        currentCursor = result.nextCursor;
        
        // 添加延迟（最后一页不延迟）
        if (page < SYNC_CONFIG.END_PAGE && result.nextCursor) {
          await delay(SYNC_CONFIG.DELAY_BETWEEN_PAGES);
        }
        
      } catch (error) {
        console.error(`❌ 第${page}页失败:`, error.message);
        syncStatus.details.push({
          page,
          error: error.message,
          success: false
        });
        syncStatus.error = `第${page}页失败: ${error.message}`;
        break;
      }
    }
    
    // 同步完成
    syncStatus.isRunning = false;
    console.log(`🎉 同步完成! 共导入${syncStatus.importedCount}个产品`);
    
  } catch (error) {
    console.error("同步过程出错:", error);
    syncStatus.error = error.message;
    syncStatus.isRunning = false;
  }
}

// 获取活跃产品总数
async function getActiveProductsCount(accessToken, vendor) {
  const query = `
    {
      products(first: 1, statuses: [ACTIVE]) {
        totalCount
      }
    }
  `;
  
  const response = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query })
  });
  
  const data = await response.json();
  return data.data?.products?.totalCount || 0;
}

// 查找指定页数的cursor
async function findPageCursor(accessToken, vendor, targetPage) {
  let cursor = null;
  const productsPerPage = 50; // 使用固定的每页数量进行定位
  
  // 如果要找第一页，返回null
  if (targetPage <= 1) return null;
  
  console.log(`🔍 正在定位第${targetPage}页...`);
  
  for (let page = 1; page < targetPage; page++) {
    try {
      const result = await fetchProductsWithCursor(accessToken, vendor, productsPerPage, cursor);
      
      if (!result.nextCursor) {
        console.log(`⚠️ 在第${page}页后找不到更多产品`);
        return null;
      }
      
      cursor = result.nextCursor;
      console.log(`📍 已定位到第${page}页`);
      
      // 每定位5页添加一次延迟
      if (page % 5 === 0) {
        await delay(500);
      }
      
    } catch (error) {
      console.error(`定位第${page}页时出错:`, error.message);
      throw error;
    }
  }
  
  return cursor;
}

// 使用cursor获取产品
async function fetchProductsWithCursor(accessToken, vendor, first, after = null) {
  const query = `
    {
      products(
        first: ${first}
        ${after ? `, after: "${after}"` : ''}
        statuses: [ACTIVE]
        sortKey: CREATED_AT
        sortOrder: ASC
      ) {
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
        },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      // 检查GraphQL错误
      if (data.errors) {
        const errorMsg = data.errors[0]?.message || "GraphQL错误";
        
        // 处理节流
        if (errorMsg.includes("Throttled") && retryCount < SYNC_CONFIG.MAX_RETRIES - 1) {
          retryCount++;
          const delayTime = Math.pow(2, retryCount) * 1000;
          console.log(`⏳ 被节流，等待${delayTime/1000}秒后重试...`);
          await delay(delayTime);
          continue;
        }
        
        throw new Error(errorMsg);
      }
      
      if (!data.data?.products) {
        throw new Error("API返回数据格式错误");
      }
      
      const edges = data.data.products.edges || [];
      const products = edges.map(edge => edge.node);
      const pageInfo = data.data.products.pageInfo || {};
      
      return {
        products,
        nextCursor: pageInfo.endCursor,
        hasNextPage: pageInfo.hasNextPage || false
      };
      
    } catch (error) {
      retryCount++;
      if (retryCount >= SYNC_CONFIG.MAX_RETRIES) {
        throw new Error(`获取产品失败: ${error.message} (已重试${SYNC_CONFIG.MAX_RETRIES}次)`);
      }
      
      const delayTime = Math.pow(2, retryCount) * 1000;
      console.log(`⏳ 请求失败，等待${delayTime/1000}秒后重试...`);
      await delay(delayTime);
    }
  }
  
  throw new Error("获取产品失败");
}

// 导入产品到数据库
async function importProducts(products) {
  console.log(`📥 导入${products.length}个产品...`);
  
  let successCount = 0;
  
  for (const product of products) {
    try {
      // TODO: 替换为你的数据库导入逻辑
      // await db.product.upsert({ ... });
      
      // 模拟导入
      await delay(10);
      successCount++;
      
    } catch (error) {
      console.error(`导入产品 ${product.id} 失败:`, error.message);
    }
  }
  
  return successCount;
}

// 延迟函数
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 重置同步状态
export async function action() {
  syncStatus = {
    isRunning: false,
    totalProducts: 0,
    importedCount: 0,
    currentPage: 0,
    error: null,
    details: []
  };
  
  return json({
    ok: true,
    message: "同步状态已重置"
  });
}
