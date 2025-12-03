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

  const results = [];
  const cursors = []; // 存储所有cursors用于调试

  console.log("🚀 开始测试 Shopfront 分页");

  // 先获取第一页，查看totalCount
  const initialQuery = `
    {
      products(first: 1) {
        totalCount
      }
    }
  `;

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

  while (hasNextPage) {
    page++;

    // 根据页面调整每页数量
    let first = 200;
    if (page <= 5) {
      first = 200; // 前5页尝试大数量
    } else if (page <= 10) {
      first = 100; // 中间页减少数量
    } else {
      first = 50; // 后期页使用小数量
    }

    const query = `
      {
        products(first: ${first} ${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            cursor
            node { 
              id 
              name
              createdAt
            }
          }
          pageInfo { 
            hasNextPage 
            endCursor 
            startCursor
            hasPreviousPage
          }
          totalCount
        }
      }
    `;

    console.log(`📄 请求第 ${page} 页: first=${first}, cursor=${cursor ? '有' : '无'}`);

    try {
      const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
        timeout: 30000
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
        console.log("📝 请求的query:", query);
        
        // 如果是分页错误，尝试不同的分页策略
        const hasPaginationError = data.errors.some(err => 
          err.message?.includes("cursor") || 
          err.message?.includes("after") ||
          err.message?.includes("pagination")
        );
        
        if (hasPaginationError && page > 1) {
          console.log("🔄 检测到分页错误，尝试跳过当前cursor...");
          // 清空cursor，从新开始
          cursor = null;
          continue;
        }
        
        return json({ 
          error: "GraphQL错误", 
          details: data.errors,
          query,
          page,
          cursor
        }, { status: 500 });
      }

      const edges = data.data?.products?.edges || [];
      const pageInfo = data.data?.products?.pageInfo;
      const currentTotalCount = data.data?.products?.totalCount || 0;

      hasNextPage = pageInfo?.hasNextPage ?? false;
      const newCursor = pageInfo?.endCursor;
      
      console.log(
        `第 ${page} 页：获取 ${edges.length} 个产品，hasNextPage = ${hasNextPage}, endCursor = ${newCursor ? '有' : '无'}`
      );
      
      if (edges.length > 0) {
        console.log(`  第一个产品: ${edges[0].node.name} (${edges[0].node.id})`);
        console.log(`  最后一个产品: ${edges[edges.length-1].node.name} (${edges[edges.length-1].node.id})`);
      }

      totalProducts += edges.length;

      results.push({
        page,
        count: edges.length,
        hasNextPage,
        endCursor: newCursor ? '存在' : 'null',
        startCursor: pageInfo?.startCursor ? '存在' : 'null',
        totalCount: currentTotalCount
      });

      cursors.push({
        page,
        cursor: newCursor,
        cursorId: newCursor ? Buffer.from(newCursor, 'base64').toString() : null
      });

      // 更新cursor
      cursor = newCursor;

      // 如果edges为空，停止循环
      if (edges.length === 0) {
        console.log("⚠️ 当前页返回0个产品，停止循环");
        hasNextPage = false;
        break;
      }

      // 添加延迟避免速率限制
      if (page % 3 === 0) {
        console.log("⏳ 添加延迟避免速率限制...");
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 安全限制
      if (page > 50) {
        console.log("⚠️ 安全限制：超过50页");
        break;
      }

      // 如果已经获取足够多的产品
      if (totalProducts >= 1000 && totalCount > 0 && totalProducts >= totalCount * 0.8) {
        console.log(`🎯 已获取 ${totalProducts}/${totalCount} 个产品，停止`);
        break;
      }

    } catch (error) {
      console.error(`❌ 第 ${page} 页请求失败:`, error.message);
      
      if (page > 1) {
        // 尝试重新获取上一页的cursor
        const prevResult = results[results.length - 2];
        if (prevResult?.endCursor === '存在') {
          console.log("🔄 尝试使用上一页的cursor重新开始...");
          cursor = cursors[cursors.length - 2]?.cursor;
          page--; // 重试当前页
          continue;
        }
      }
      
      return json({ 
        error: `第 ${page} 页请求失败: ${error.message}`,
        results,
        totalProducts 
      }, { status: 500 });
    }
  }

  console.log(`🎉 分页测试结束，共获取 ${totalProducts} 个产品`);
  
  // 尝试不同的分页策略
  console.log("🧪 尝试验证不同的分页参数...");
  await testAlternativePagination(tokens.access_token, vendor);

  return json({
    ok: true,
    message: `分页测试完成，共 ${totalProducts} 个产品`,
    totalProducts,
    expectedTotal: totalCount,
    pagesTested: results.length,
    details: results,
    cursors: cursors.slice(0, 5), // 只返回前5个cursor信息
  });
}

// 测试不同的分页策略
async function testAlternativePagination(accessToken, vendor) {
  console.log("\n🔍 测试不同的分页策略:");
  
  const strategies = [
    { first: 100, name: "固定100个" },
    { first: 50, name: "固定50个" },
    { first: 20, name: "固定20个" }
  ];

  for (const strategy of strategies) {
    console.log(`\n测试策略: ${strategy.name}`);
    
    try {
      const query = `
        {
          products(first: ${strategy.first}) {
            edges {
              cursor
              node { id name }
            }
            pageInfo { hasNextPage endCursor }
            totalCount
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
      const edges = data.data?.products?.edges || [];
      
      console.log(`${strategy.name}: 获取 ${edges.length} 个产品，hasNextPage: ${data.data?.products?.pageInfo?.hasNextPage}`);
      
    } catch (error) {
      console.log(`${strategy.name}: 失败 - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}
