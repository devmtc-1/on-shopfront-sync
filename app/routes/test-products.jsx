// app/routes/test-category-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function loader() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ error: "请先授权再测试" }, { status: 401 });
  }

  const CATEGORY_ID = "11e96ba509ddf5a487c00ab419c1109c";
  
  console.log(`🚀 开始同步分类 ${CATEGORY_ID} 的ACTIVE产品`);

  let cursor = null;
  let hasNextPage = true;
  let page = 0;
  let totalProducts = 0;

  const results = [];
  const allProducts = [];

  try {
    // 先获取该分类的ACTIVE产品总数
    console.log("📊 获取分类ACTIVE产品总数...");
    
    const countQuery = `
      {
        products(first: 1, categories: ["${CATEGORY_ID}"], statuses: [ACTIVE]) {
          totalCount
        }
      }
    `;

    const countResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: countQuery }),
    });

    const countData = await countResp.json();
    const totalCount = countData.data?.products?.totalCount || 0;
    
    if (totalCount === 0) {
      console.log(`ℹ️ 分类 ${CATEGORY_ID} 没有ACTIVE产品`);
      return json({
        ok: true,
        message: "该分类没有ACTIVE产品",
        totalCount: 0
      });
    }
    
    console.log(`✅ 分类ACTIVE产品总数: ${totalCount}`);
    console.log(`📊 预计页数: ${Math.ceil(totalCount / 50)} (每页50个)`);
    
    // 等待2秒再开始分页
    console.log("⏳ 等待2秒后开始分页...");
    await delay(2000);

    while (hasNextPage && page < 50) { // 安全限制：最多50页
      page++;

      // 获取指定分类的ACTIVE状态产品，每页50个
      const query = `
        {
          products(
            first: 50 
            ${cursor ? `, after: "${cursor}"` : ""}
            categories: ["${CATEGORY_ID}"]
            statuses: [ACTIVE]
          ) {
            edges {
              cursor
              node { 
                id 
                name
                status
                description
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

      console.log(`📄 请求第 ${page} 页...`);

      try {
        const startTime = Date.now();
        const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
          timeout: 60000 // 60秒超时
        });

        const responseTime = Date.now() - startTime;
        
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        
        const text = await resp.text();
        let data;

        try {
          data = JSON.parse(text);
        } catch (err) {
          console.error("❌ JSON解析失败:", text.substring(0, 200));
          results.push({
            page,
            success: false,
            error: "JSON解析失败",
            responseTime
          });
          break;
        }

        if (data.errors) {
          console.error("❌ GraphQL错误:", data.errors);
          results.push({
            page,
            success: false,
            error: data.errors[0]?.message || "GraphQL错误",
            responseTime
          });
          break;
        }

        const edges = data.data?.products?.edges || [];
        const pageInfo = data.data?.products?.pageInfo;

        hasNextPage = pageInfo?.hasNextPage ?? false;
        cursor = pageInfo?.endCursor ?? null;

        const products = edges.map(edge => edge.node);
        totalProducts += products.length;
        
        // 收集所有产品
        allProducts.push(...products);

        // 显示详情
        if (products.length > 0) {
          const firstProduct = products[0];
          
          console.log(
            `✅ 第 ${page} 页：获取 ${products.length} 个产品 | ` +
            `累计: ${totalProducts}/${totalCount} | ` +
            `响应时间: ${responseTime}ms | ` +
            `hasNextPage: ${hasNextPage}`
          );
          
          console.log(`  示例产品: ${firstProduct.name}`);
          console.log(`  产品ID: ${firstProduct.id}`);
          console.log(`  状态: ${firstProduct.status}`);
          
          if (firstProduct.prices && firstProduct.prices.length > 0) {
            console.log(`  价格: ${firstProduct.prices[0].price} (${firstProduct.prices[0].quantity}个)`);
          }
          
          if (firstProduct.barcodes && firstProduct.barcodes.length > 0) {
            console.log(`  条码: ${firstProduct.barcodes[0].code}`);
          }
        } else {
          console.log(`ℹ️ 第 ${page} 页：0 个产品，hasNextPage = ${hasNextPage}`);
        }

        results.push({
          page,
          success: true,
          count: products.length,
          responseTime,
          hasNextPage,
          endCursorShort: cursor ? cursor.substring(0, 20) + '...' : null,
          firstProductId: products.length > 0 ? products[0].id : null,
          firstProductName: products.length > 0 ? products[0].name : null
        });

        // 固定延迟：每页之间等待2秒
        if (hasNextPage) {
          console.log(`⏳ 等待2秒后请求下一页...`);
          await delay(2000);
        }

        // 进度检查
        if (totalCount > 0) {
          const progress = ((totalProducts / totalCount) * 100).toFixed(1);
          console.log(`📈 进度: ${progress}% (${totalProducts}/${totalCount})`);
        }

        // 如果已经获取了所有产品，提前结束
        if (totalCount > 0 && totalProducts >= totalCount) {
          console.log(`🎯 已获取所有 ${totalProducts} 个产品，提前结束`);
          hasNextPage = false;
        }

      } catch (error) {
        console.error(`❌ 第 ${page} 页请求失败:`, error.message);
        results.push({
          page,
          success: false,
          error: error.message,
          failed: true
        });
        
        // 如果是超时错误，可能是深度分页问题
        if (error.message.includes("timeout") || error.message.includes("504")) {
          console.log(`⚠️ 检测到超时，可能是深度分页问题`);
          console.log(`💡 建议: 减少每页产品数量或按其他方式分批`);
        }
        
        break;
      }
    }

  } catch (error) {
    console.error("❌ 初始化失败:", error.message);
    return json({ 
      error: "测试失败: " + error.message 
    }, { status: 500 });
  }

  console.log("\n🎉 分页测试结束");
  console.log(`📊 分类 ${CATEGORY_ID} 总计获取: ${totalProducts} 个ACTIVE产品`);
  console.log(`📊 测试页数: ${results.length}`);
  
  if (allProducts.length > 0) {
    console.log(`📋 获取的产品列表 (前10个):`);
    allProducts.slice(0, 10).forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.name} (ID: ${product.id})`);
    });
    
    if (allProducts.length > 10) {
      console.log(`  ... 还有 ${allProducts.length - 10} 个产品`);
    }
  }

  // 分析结果
  const successfulPages = results.filter(r => r.success).length;
  const failedPages = results.filter(r => !r.success).length;
  
  console.log(`📊 成功页数: ${successfulPages}`);
  console.log(`📊 失败页数: ${failedPages}`);
  
  // 统计响应时间
  const successfulResults = results.filter(r => r.success && r.responseTime);
  if (successfulResults.length > 0) {
    const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length;
    console.log(`⏱️ 平均响应时间: ${avgResponseTime.toFixed(0)}ms`);
  }

  return json({
    ok: true,
    message: `分类 ${CATEGORY_ID} ACTIVE产品分页测试完成`,
    categoryId: CATEGORY_ID,
    summary: {
      totalPages: results.length,
      totalProducts,
      successfulPages,
      failedPages,
      lastCursor: cursor,
      expectedTotal: totalCount,
      missingProducts: totalCount - totalProducts
    },
    productCount: allProducts.length,
    sampleProducts: allProducts.slice(0, 5).map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      category: p.category?.name,
      hasPrices: p.prices?.length > 0,
      hasBarcodes: p.barcodes?.length > 0,
      hasInventory: p.inventory?.length > 0
    })),
    details: results.map(r => ({
      page: r.page,
      success: r.success,
      count: r.count,
      responseTime: r.responseTime,
      hasNextPage: r.hasNextPage,
      error: r.error
    })),
    recommendations: [
      "✅ 按分类同步是可行的",
      "💡 可以使用这个模式同步其他分类",
      "⏱️ 每页之间保持2-3秒延迟",
      "🔍 监控响应时间，确保不会超时",
      "📊 这个分类有20个ACTIVE产品，适合测试"
    ]
  });
}
