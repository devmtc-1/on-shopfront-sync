// app/routes/test-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

export async function loader() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ error: "请先授权再测试" }, { status: 401 });
  }

  let cursor = null;
  let hasNextPage = true;
  let page = 0;
  let totalProducts = 0;
  let allProductIds = new Set(); // 用于检查重复

  const results = [];
  const cursors = [];

  console.log("🚀 开始测试 Shopfront 分页");

  // 先获取总产品数
  const initialQuery = `
    {
      products(first: 1) {
        totalCount
      }
    }
  `;

  try {
    const initialResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: initialQuery }),
    });

    const initialData = await initialResp.json();
    const totalCount = initialData.data?.products?.totalCount || 0;
    
    console.log(`📊 后台总产品数: ${totalCount}`);
    console.log(`📊 开始分页获取...`);

    while (hasNextPage) {
      page++;

      // 根据Shopfront API的限制调整每页数量
      let first = 100; // 从100开始
      if (page > 20) {
        first = 50; // 20页后减小数量
      }

      const query = `
        {
          products(first: ${first} ${cursor ? `, after: "${cursor}"` : ""}) {
            edges {
              cursor
              node { 
                id 
                name
                status
                createdAt
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

      console.log(`📄 第 ${page} 页: first=${first}, cursor=${cursor ? '...' + cursor.slice(-20) : '无'}`);

      const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const text = await resp.text();
      let data;

      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error("❌ GraphQL 返回非 JSON：", text.substring(0, 200));
        return json({ 
          error: "GraphQL 返回非 JSON", 
          raw: text.substring(0, 200),
          page,
          cursor 
        }, { status: 500 });
      }

      // 检查API错误
      if (data.errors) {
        console.error("❌ GraphQL 错误:", data.errors);
        
        // 如果是cursor错误，尝试重新开始
        const hasCursorError = data.errors.some(err => 
          err.message?.includes("cursor") || 
          err.message?.includes("after")
        );
        
        if (hasCursorError && page > 1) {
          console.log("🔄 检测到cursor错误，尝试使用较小的first值重新开始...");
          
          // 尝试用first=50重新开始
          const retryQuery = `
            {
              products(first: 50) {
                edges {
                  cursor
                  node { id }
                }
                pageInfo { 
                  hasNextPage 
                  endCursor 
                }
              }
            }
          `;
          
          const retryResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${tokens.access_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ query: retryQuery }),
          });
          
          const retryData = await retryResp.json();
          if (retryData.data?.products) {
            cursor = retryData.data.products.pageInfo.endCursor;
            console.log("🔄 使用新cursor重新开始:", cursor ? '...' + cursor.slice(-20) : '无');
            page--; // 不增加页数
            continue;
          }
        }
        
        return json({ 
          error: "GraphQL错误", 
          details: data.errors,
          page,
          cursor
        }, { status: 500 });
      }

      const edges = data.data?.products?.edges || [];
      const pageInfo = data.data?.products?.pageInfo;

      hasNextPage = pageInfo?.hasNextPage ?? false;
      const newCursor = pageInfo?.endCursor;
      
      console.log(`  获取 ${edges.length} 个产品，hasNextPage = ${hasNextPage}`);
      
      // 检查是否有重复产品
      let duplicates = 0;
      edges.forEach(edge => {
        if (allProductIds.has(edge.node.id)) {
          duplicates++;
        }
        allProductIds.add(edge.node.id);
      });
      
      if (duplicates > 0) {
        console.warn(`  ⚠️ 发现 ${duplicates} 个重复产品ID`);
      }
      
      if (edges.length > 0) {
        const firstProduct = edges[0].node;
        const lastProduct = edges[edges.length-1].node;
        console.log(`  第一产品: ${firstProduct.name.substring(0, 30)}... (${firstProduct.status})`);
        console.log(`  最后产品: ${lastProduct.name.substring(0, 30)}... (${lastProduct.status})`);
      } else {
        console.log(`  ⚠️ 当前页返回0个产品`);
      }

      totalProducts += edges.length;

      results.push({
        page,
        first,
        count: edges.length,
        duplicates,
        hasNextPage,
        endCursor: newCursor ? '存在' : 'null',
        totalProductsSoFar: totalProducts
      });

      cursors.push({
        page,
        cursor: newCursor,
        cursorDecoded: newCursor ? Buffer.from(newCursor, 'base64').toString() : null
      });

      // 更新cursor
      cursor = newCursor;

      // 如果edges为空，停止循环
      if (edges.length === 0) {
        console.log("🛑 当前页返回0个产品，停止循环");
        hasNextPage = false;
        break;
      }

      // 添加延迟避免速率限制
      if (page % 5 === 0) {
        console.log("⏳ 添加2秒延迟...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // 安全限制
      if (page > 100) {
        console.log("⚠️ 安全限制：超过100页");
        break;
      }

      // 如果总产品数已经达到或超过API返回的总数
      if (totalCount > 0 && totalProducts >= totalCount) {
        console.log(`🎯 已获取所有 ${totalProducts} 个产品`);
        hasNextPage = false;
        break;
      }
    }

    console.log(`🎉 分页测试结束，共获取 ${totalProducts} 个产品，去重后 ${allProductIds.size} 个`);
    
    // 分析产品状态分布
    await analyzeProductStatus(tokens.access_token, vendor);

    return json({
      ok: true,
      message: `分页测试完成，共获取 ${totalProducts} 个产品`,
      summary: {
        totalProducts,
        uniqueProducts: allProductIds.size,
        pages: results.length,
        expectedTotal: totalCount,
        missingProducts: totalCount > 0 ? totalCount - allProductIds.size : null
      },
      details: results,
      firstFewCursors: cursors.slice(0, 3)
    });

  } catch (error) {
    console.error("❌ 测试过程出错:", error);
    return json({ 
      error: `测试失败: ${error.message}`,
      results,
      totalProducts 
    }, { status: 500 });
  }
}

// 分析产品状态分布
async function analyzeProductStatus(accessToken, vendor) {
  console.log("\n📈 分析产品状态分布...");
  
  const statusQueries = [
    { status: "ACTIVE", name: "active" },
    { status: "DRAFT", name: "draft" },
    { status: "ARCHIVED", name: "archived" }
  ];

  for (const status of statusQueries) {
    try {
      const query = `
        {
          products(first: 10, query: "status:${status.name}") {
            totalCount
            edges {
              node {
                id
                name
                status
              }
            }
          }
        }
      `;

      const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await resp.json();
      const total = data.data?.products?.totalCount || 0;
      
      console.log(`  ${status.status} 状态: ${total} 个产品`);
      
    } catch (error) {
      console.log(`  查询 ${status.status} 状态失败: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

// 添加一个新的端点来测试不同的查询方式
export async function action() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ error: "请先授权" }, { status: 401 });
  }

  // 测试不同的查询方式
  const testQueries = [
    {
      name: "只查询活跃产品",
      query: `
        {
          products(first: 200, query: "status:active") {
            edges {
              node { id name status }
            }
            pageInfo { hasNextPage endCursor }
            totalCount
          }
        }
      `
    },
    {
      name: "按创建时间排序",
      query: `
        {
          products(first: 200, sortKey: CREATED_AT) {
            edges {
              node { id name createdAt }
            }
            pageInfo { hasNextPage endCursor }
            totalCount
          }
        }
      `
    },
    {
      name: "查询特定字段",
      query: `
        {
          products(first: 200) {
            edges {
              node { 
                id 
                name 
                status
                type
                category { name }
              }
            }
            pageInfo { hasNextPage endCursor }
            totalCount
          }
        }
      `
    }
  ];

  const results = [];
  
  for (const test of testQueries) {
    try {
      const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: test.query }),
      });

      const data = await resp.json();
      const edges = data.data?.products?.edges || [];
      const totalCount = data.data?.products?.totalCount || 0;
      
      results.push({
        name: test.name,
        success: !data.errors,
        count: edges.length,
        totalCount,
        hasNextPage: data.data?.products?.pageInfo?.hasNextPage,
        error: data.errors?.[0]?.message
      });
      
      console.log(`${test.name}: ${edges.length} 个产品，总计 ${totalCount}`);
      
    } catch (error) {
      results.push({
        name: test.name,
        success: false,
        error: error.message
      });
      console.error(`${test.name}: 失败 - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return json({ ok: true, results });
}
