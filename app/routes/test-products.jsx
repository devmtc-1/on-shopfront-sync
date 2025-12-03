// app/routes/test-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 带重试的fetch函数
async function fetchWithRetry(url, options, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      const text = await response.text();
      const data = JSON.parse(text);
      
      // 检查Throttled错误
      if (data.errors && data.errors.some(err => err.message === "Throttled")) {
        if (attempt < maxRetries) {
          const waitTime = attempt * 2000 + Math.random() * 1000; // 指数退避
          console.log(`⏰ 被节流，等待${waitTime/1000}秒后重试 (${attempt}/${maxRetries})...`);
          await delay(waitTime);
          continue;
        } else {
          throw new Error("Throttled: 已达到最大重试次数");
        }
      }
      
      return { response, data, text };
      
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const waitTime = attempt * 1000;
        console.log(`⚠️ 请求失败，等待${waitTime/1000}秒后重试 (${attempt}/${maxRetries})...`);
        await delay(waitTime);
      }
    }
  }
  
  throw lastError;
}

export async function loader() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ error: "请先授权再测试" }, { status: 401 });
  }

  const CATEGORY_ID = "11e718d3cac71ecaa6100a1468096c0d";
  
  let cursor = null;
  let hasNextPage = true;
  let page = 0;
  let totalProducts = 0;
  let throttledCount = 0;

  const results = [];

  console.log(`🚀 开始测试分类 ${CATEGORY_ID} 的产品分页`);

  try {
    // 先获取该分类的产品总数
    console.log("📊 获取分类产品总数...");
    
    const countQuery = `
      {
        products(first: 1, categories: ["${CATEGORY_ID}"], statuses: [ACTIVE]) {
          totalCount
        }
      }
    `;

    const countResult = await fetchWithRetry(
      `https://${vendor}.onshopfront.com/api/v2/graphql`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: countQuery }),
      }
    );

    const totalCount = countResult.data.data?.products?.totalCount ?? 0;
    
    if (totalCount === 0) {
      console.log(`ℹ️ 分类 ${CATEGORY_ID} 没有活跃产品`);
      return json({
        ok: true,
        message: "该分类没有活跃产品",
        totalCount: 0
      });
    }
    
    console.log(`✅ 分类活跃产品总数: ${totalCount}`);
    console.log(`📊 预计页数: ${Math.ceil(totalCount / 50)} (每页50个)`);
    
    // 等待2秒再开始分页，给API喘息时间
    console.log("⏳ 等待2秒后开始分页...");
    await delay(2000);

    while (hasNextPage) {
      page++;

      // 获取指定分类的ACTIVE状态产品，每页50个
      const query = `
        {
          products(
            first: 50 
            ${cursor ? `, after: "${cursor}"` : ""}
            categories: ["${CATEGORY_ID}"]
            statuses: [ACTIVE]
            sortKey: CREATED_AT
            sortOrder: ASC
          ) {
            edges {
              cursor
              node { 
                id 
                name
                status
                createdAt
                category { id name }
              }
            }
            pageInfo { 
              hasNextPage 
              endCursor 
            }
            totalCount
          }
        }
      `;

      console.log(`📄 请求第 ${page} 页...`);
      console.log(`📌 游标: ${cursor ? cursor.substring(0, 30) + '...' : '无'}`);

      try {
        const startTime = Date.now();
        const result = await fetchWithRetry(
          `https://${vendor}.onshopfront.com/api/v2/graphql`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${tokens.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query }),
          }
        );

        const responseTime = Date.now() - startTime;
        const data = result.data;
        const edges = data.data?.products?.edges || [];
        const pageInfo = data.data?.products?.pageInfo;
        const pageTotalCount = data.data?.products?.totalCount ?? 0;

        hasNextPage = pageInfo?.hasNextPage ?? false;
        cursor = pageInfo?.endCursor ?? null;

        totalProducts += edges.length;

        // 显示详情
        if (edges.length > 0) {
          const firstProduct = edges[0].node;
          const categoryName = firstProduct.category?.name || '未知分类';
          
          console.log(
            `✅ 第 ${page} 页：获取 ${edges.length} 个产品 | ` +
            `累计: ${totalProducts}/${totalCount} | ` +
            `响应时间: ${responseTime}ms | ` +
            `hasNextPage: ${hasNextPage}`
          );
          
          // 每页都显示产品示例（分类同步数量较少）
          console.log(`  示例产品: ${firstProduct.name.substring(0, 40)}...`);
          console.log(`  分类: ${categoryName}`);
          console.log(`  创建时间: ${new Date(firstProduct.createdAt).toLocaleDateString()}`);
          
          // 如果是第一页或最后一页，显示更多信息
          if (page === 1 || !hasNextPage) {
            console.log(`  产品ID: ${firstProduct.id}`);
          }
        } else {
          console.log(`ℹ️ 第 ${page} 页：0 个产品，hasNextPage = ${hasNextPage}`);
        }

        results.push({
          page,
          count: edges.length,
          responseTime,
          hasNextPage,
          endCursorShort: cursor ? cursor.substring(0, 20) + '...' : null,
          firstProductId: edges.length > 0 ? edges[0].node.id : null,
          firstProductName: edges.length > 0 ? edges[0].node.name : null
        });

        // 固定延迟：每页之间等待3秒，避免Throttled
        if (hasNextPage) {
          console.log(`⏳ 等待3秒后请求下一页...`);
          await delay(3000);
        }

        // 进度检查
        if (totalCount > 0) {
          const progress = ((totalProducts / totalCount) * 100).toFixed(1);
          console.log(`📈 进度: ${progress}% (${totalProducts}/${totalCount})`);
        }

        // 安全限制
        if (page > 100) { // 最多100页（5000个产品）
          console.log("⚠️ 安全限制：超过100页，停止测试");
          break;
        }

        // 如果已经获取了所有产品，提前结束
        if (totalCount > 0 && totalProducts >= totalCount) {
          console.log(`🎯 已获取所有 ${totalProducts} 个产品，提前结束`);
          hasNextPage = false;
        }

      } catch (error) {
        if (error.message.includes("Throttled")) {
          throttledCount++;
          console.error(`❌ 第 ${page} 页：严重节流`);
          
          if (throttledCount >= 2) {
            console.error("🛑 连续两次被严重节流，停止测试");
            break;
          }
        } else {
          console.error(`❌ 第 ${page} 页请求失败:`, error.message);
        }
        
        // 记录失败页
        results.push({
          page,
          count: 0,
          hasNextPage: false,
          error: error.message,
          failed: true
        });
        
        break;
      }
    }

  } catch (error) {
    console.error("❌ 初始化失败:", error.message);
    return json({ 
      error: "测试失败: " + error.message 
    }, { status: 500 });
  }

  console.log("🎉 分页测试结束");
  console.log(`📊 分类 ${CATEGORY_ID} 总计获取: ${totalProducts} 个活跃产品`);
  console.log(`📊 测试页数: ${results.length}`);

  // 分析结果
  const successfulPages = results.filter(r => !r.failed && r.count > 0).length;
  const emptyPages = results.filter(r => !r.failed && r.count === 0).length;
  const failedPages = results.filter(r => r.failed).length;
  
  console.log(`📊 成功页数: ${successfulPages}`);
  console.log(`📊 空页数: ${emptyPages}`);
  console.log(`📊 失败页数: ${failedPages}`);
  
  if (throttledCount > 0) {
    console.log(`⚠️ 被节流次数: ${throttledCount}`);
  }

  // 统计响应时间
  const successfulResults = results.filter(r => !r.failed && r.responseTime);
  if (successfulResults.length > 0) {
    const avgResponseTime = successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length;
    console.log(`⏱️ 平均响应时间: ${avgResponseTime.toFixed(0)}ms`);
  }

  return json({
    ok: true,
    message: `分类 ${CATEGORY_ID} 分页测试完成`,
    categoryId: CATEGORY_ID,
    summary: {
      totalPages: results.length,
      totalProducts,
      successfulPages,
      emptyPages,
      failedPages,
      throttledCount,
      lastCursor: cursor
    },
    details: results,
    recommendations: [
      "按分类同步可以有效避免深度分页问题",
      "如果这个分类同步成功，可以扩展到其他分类",
      "建议每页之间保持3-5秒延迟",
      "监控响应时间，如果变慢可能需要调整策略"
    ]
  });
}
