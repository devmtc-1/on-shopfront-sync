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

  // 硬编码分类ID
  const CATEGORY_ID = "11eab4ebb0969a28ab7c02e7544f9a3c";
  
  let cursor = null;
  let hasNextPage = true;
  let page = 0;
  let totalProducts = 0;

  const results = [];
  const allProducts = []; // 存储所有获取到的产品

  console.log(`🚀 开始测试分类 ${CATEGORY_ID} 的ACTIVE产品分页`);

  // 先获取该分类的活跃产品数
  try {
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

    const countText = await countResp.text();
    const countData = JSON.parse(countText);
    const totalCategoryCount = countData.data?.products?.totalCount ?? 0;
    
    console.log(`📊 分类 ${CATEGORY_ID} 活跃产品总数: ${totalCategoryCount}`);
    console.log(`📊 预计页数: ${Math.ceil(totalCategoryCount / 50)} (每页50个)`);
    
  } catch (error) {
    console.log("⚠️ 无法获取分类产品总数，继续分页测试");
  }

  while (hasNextPage) {
    page++;

    // 获取指定分类的ACTIVE状态产品，每页50个
    const query = `
      {
        products(first: 50 ${cursor ? `, after: "${cursor}"` : ""}, categories: ["${CATEGORY_ID}"], statuses: [ACTIVE]) {
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
    
    // 收集产品
    const products = edges.map(edge => edge.node);
    allProducts.push(...products);

    // 显示更多详情
    if (edges.length > 0) {
      const firstProduct = edges[0].node;
      const categoryName = firstProduct.category?.name || '未知分类';
      
      console.log(
        `第 ${page} 页：${edges.length} 个产品 | ` +
        `累计: ${totalProducts} | ` +
        `hasNextPage: ${hasNextPage} | ` +
        `分类: ${categoryName}`
      );
      
      // 每页都显示产品示例（因为分类产品数量少）
      console.log(`  示例产品: ${firstProduct.name.substring(0, 40)}... (${firstProduct.status})`);
      console.log(`  产品ID: ${firstProduct.id}`);
      console.log(`  创建时间: ${new Date(firstProduct.createdAt).toLocaleDateString()}`);
    } else {
      console.log(`第 ${page} 页：0 个产品，hasNextPage = ${hasNextPage}`);
    }

    results.push({
      page,
      count: edges.length,
      hasNextPage,
      endCursor: cursor ? cursor.substring(0, 20) + '...' : null,
      firstProductId: edges.length > 0 ? edges[0].node.id : null,
      firstProductName: edges.length > 0 ? edges[0].node.name : null,
      categoryName: edges.length > 0 ? edges[0].node.category?.name : null
    });

    // 添加延迟避免速率限制（每页都延迟，因为分类产品少）
    if (hasNextPage) {
      console.log("⏳ 添加2秒延迟避免速率限制...");
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 安全避免死循环
    if (page > 80) { // 最多50页
      console.log("⚠️ 安全限制：超过80页，停止测试");
      break;
    }
    
    // 如果已经很久没有获取到产品，停止
    if (page > 5 && totalProducts === 0) {
      console.log("⚠️ 已获取5页但无产品，停止测试");
      break;
    }
  }

  console.log("🎉 分页测试结束");
  console.log(`📊 分类 ${CATEGORY_ID} 总计获取: ${totalProducts} 个活跃产品`);
  console.log(`📊 测试页数: ${results.length}`);
  
  // 显示所有获取到的产品
  if (allProducts.length > 0) {
    console.log(`\n📋 获取的产品列表:`);
    allProducts.forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.name} (ID: ${product.id}, 状态: ${product.status})`);
    });
  }

  // 分析结果
  const pagesWithProducts = results.filter(r => r.count > 0).length;
  const pagesWithoutProducts = results.filter(r => r.count === 0).length;
  
  console.log(`📊 有产品的页数: ${pagesWithProducts}`);
  console.log(`📊 无产品的页数: ${pagesWithoutProducts}`);

  return json({
    ok: true,
    message: `分类 ${CATEGORY_ID} 分页测试完成`,
    categoryId: CATEGORY_ID,
    summary: {
      totalPages: results.length,
      totalProducts,
      pagesWithProducts,
      pagesWithoutProducts
    },
    productList: allProducts.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      category: p.category?.name,
      createdAt: p.createdAt
    })),
    pagesTested: results.length,
    details: results,
  });
}
