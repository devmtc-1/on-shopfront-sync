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

  console.log("🚀 开始测试 Shopfront 分页（只获取ACTIVE产品，每页50个）");

  // 先获取总活跃产品数
  try {
    const countQuery = `
      {
        products(first: 1, statuses: [ACTIVE]) {
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

    const countText = await countResp.text();
    const countData = JSON.parse(countText);
    const totalActiveCount = countData.data?.products?.totalCount ?? 0;
    
    console.log(`📊 活跃产品总数: ${totalActiveCount}`);
    console.log(`📊 预计页数: ${Math.ceil(totalActiveCount / 50)} (每页50个)`);
    
  } catch (error) {
    console.log("⚠️ 无法获取总产品数，继续分页测试");
  }

  while (hasNextPage) {
    page++;

    // 只获取ACTIVE状态的产品，每页50个
    const query = `
      {
        products(first: 50 ${cursor ? `, after: "${cursor}"` : ""}, statuses: [ACTIVE]) {
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
      return json({ error: "GraphQL 返回非 JSON", raw: text.substring(0, 200) }, { status: 500 });
    }

    // 检查GraphQL错误
    if (data.errors) {
      console.error("❌ GraphQL 错误：", data.errors);
      return json({ error: "GraphQL 错误", details: data.errors }, { status: 500 });
    }

    const edges = data.data?.products?.edges || [];
    const pageInfo = data.data?.products?.pageInfo;
    const pageTotalCount = data.data?.products?.totalCount ?? 0;

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    totalProducts += edges.length;

    // 显示更多详情
    if (edges.length > 0) {
      const firstProduct = edges[0].node;
      const lastProduct = edges[edges.length - 1].node;
      
      console.log(
        `第 ${page} 页：${edges.length} 个产品 | ` +
        `累计: ${totalProducts} | ` +
        `hasNextPage: ${hasNextPage}`
      );
      
      // 每5页显示一次产品示例
      if (page % 5 === 0 || page === 1) {
        console.log(`  第一个产品: ${firstProduct.name.substring(0, 30)}... (${firstProduct.status})`);
        console.log(`  创建时间: ${new Date(firstProduct.createdAt).toLocaleDateString()}`);
      }
    } else {
      console.log(`第 ${page} 页：0 个产品，hasNextPage = ${hasNextPage}`);
    }

    results.push({
      page,
      count: edges.length,
      hasNextPage,
      endCursor: cursor ? cursor.substring(0, 20) + '...' : null,
      firstProductId: edges.length > 0 ? edges[0].node.id : null,
      lastProductId: edges.length > 0 ? edges[edges.length - 1].node.id : null
    });

    // 添加延迟避免速率限制（每3页延迟一次）
    if (hasNextPage && page % 3 === 0) {
      console.log("⏳ 添加1秒延迟避免速率限制...");
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // 安全避免死循环（如果活跃产品太多）
    if (page > 200) { // 200页 * 50个 = 最多10000个产品
      console.log("⚠️ 安全限制：超过200页，停止测试");
      break;
    }
    
    // 如果已经很久没有获取到产品，停止
    if (page > 10 && totalProducts === 0) {
      console.log("⚠️ 已获取10页但无产品，停止测试");
      break;
    }
  }

  console.log("🎉 分页测试结束");
  console.log(`📊 总计获取: ${totalProducts} 个活跃产品`);
  console.log(`📊 测试页数: ${results.length}`);

  // 分析结果
  const pagesWithProducts = results.filter(r => r.count > 0).length;
  const pagesWithoutProducts = results.filter(r => r.count === 0).length;
  
  console.log(`📊 有产品的页数: ${pagesWithProducts}`);
  console.log(`📊 无产品的页数: ${pagesWithoutProducts}`);

  return json({
    ok: true,
    message: "分页测试完成（只获取ACTIVE产品）",
    summary: {
      totalPages: results.length,
      totalProducts,
      pagesWithProducts,
      pagesWithoutProducts
    },
    pagesTested: results.length,
    details: results,
  });
}
