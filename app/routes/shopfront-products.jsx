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

  // 硬编码分类ID数组
  const TARGET_CATEGORIES = [
    "11eab4ebb0969a28ab7c02e7544f9a3c",
    "11e718d3d2eca958a07b0a1468096c0d"
  ];
  
  let cursor = null;
  let hasNextPage = true;
  let page = 0;
  let totalProducts = 0;

  const results = [];
  const allProducts = [];

  console.log(`🚀 开始测试 ${TARGET_CATEGORIES.length} 个分类的ACTIVE产品分页`);
  console.log(`📋 目标分类ID: ${TARGET_CATEGORIES.join(', ')}`);

  // 先获取多个分类的活跃产品数
  try {
    const categoriesParam = `categories: [${TARGET_CATEGORIES.map(id => `"${id}"`).join(', ')}]`;
    const countQuery = `
      {
        products(first: 1, ${categoriesParam}, statuses: [ACTIVE]) {
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
    console.log(`📊 总数查询响应: ${countText.substring(0, 200)}`);
    
    const countData = JSON.parse(countText);
    const totalCategoryCount = countData.data?.products?.totalCount ?? 0;
    
    console.log(`📊 多个分类活跃产品总数: ${totalCategoryCount}`);
    console.log(`📊 预计页数: ${Math.ceil(totalCategoryCount / 50)} (每页50个)`);
    
  } catch (error) {
    console.log("⚠️ 无法获取分类产品总数，继续分页测试:", error.message);
  }

  while (hasNextPage && page < 50) { // 安全限制：最多50页
    page++;

    // 修复查询字符串：避免多余的逗号
    const afterParam = cursor ? `after: "${cursor}", ` : '';
    const categoriesParam = `categories: [${TARGET_CATEGORIES.map(id => `"${id}"`).join(', ')}]`;
    
    const query = `
      {
        products(first: 50, ${afterParam}${categoriesParam}, statuses: [ACTIVE]) {
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
    console.log(`📝 查询: ${query.substring(0, 150)}...`);

    try {
      const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const text = await resp.text();
      console.log(`📥 响应状态: ${resp.status}, 长度: ${text.length}`);
      
      // 检查是否是HTML响应（可能是错误页面）
      if (text.includes('<html') || text.includes('<!DOCTYPE')) {
        console.error("❌ 服务器返回了HTML页面！可能是认证错误");
        console.error(`❌ 响应开头: ${text.substring(0, 300)}`);
        return json({ 
          error: "服务器返回HTML页面，可能是认证错误",
          raw: text.substring(0, 300)
        }, { status: 500 });
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        console.error("❌ JSON解析失败，响应内容:", text.substring(0, 500));
        return json({ 
          error: "GraphQL 返回非 JSON", 
          raw: text.substring(0, 500) 
        }, { status: 500 });
      }

      // 检查GraphQL错误
      if (data.errors) {
        console.error("❌ GraphQL 错误：", JSON.stringify(data.errors));
        return json({ 
          error: "GraphQL 错误", 
          details: data.errors 
        }, { status: 500 });
      }

      // 检查数据结构
      if (!data.data) {
        console.error("❌ 响应无data字段:", data);
        return json({ 
          error: "API返回无data字段",
          raw: data
        }, { status: 500 });
      }

      if (!data.data.products) {
        console.error("❌ 响应无products字段:", data.data);
        return json({ 
          error: "API返回无products字段",
          raw: data.data
        }, { status: 500 });
      }

      const edges = data.data.products.edges || [];
      const pageInfo = data.data.products.pageInfo || {};
      const pageTotalCount = data.data.products.totalCount ?? 0;

      hasNextPage = pageInfo.hasNextPage || false;
      cursor = pageInfo.endCursor || null;

      totalProducts += edges.length;
      
      // 收集产品
      const products = edges.map(edge => edge.node);
      allProducts.push(...products);

      // 显示详情
      if (edges.length > 0) {
        const firstProduct = edges[0].node;
        const categoryName = firstProduct.category?.name || '未知分类';
        
        console.log(
          `✅ 第 ${page} 页：${edges.length} 个产品 | ` +
          `累计: ${totalProducts} | ` +
          `hasNextPage: ${hasNextPage} | ` +
          `分类: ${categoryName}`
        );
        
        console.log(`  示例产品: ${firstProduct.name.substring(0, 40)}...`);
        console.log(`  产品ID: ${firstProduct.id}`);
        console.log(`  状态: ${firstProduct.status}`);
      } else {
        console.log(`ℹ️ 第 ${page} 页：0 个产品，hasNextPage = ${hasNextPage}`);
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

      // 添加延迟
      if (hasNextPage) {
        console.log("⏳ 添加2秒延迟...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error) {
      console.error(`❌ 第 ${page} 页请求失败:`, error.message);
      console.error("错误堆栈:", error.stack);
      return json({ 
        error: `第 ${page} 页请求失败: ${error.message}`,
        details: { page, cursor }
      }, { status: 500 });
    }
  }

  console.log("🎉 分页测试结束");
  console.log(`📊 总计获取: ${totalProducts} 个活跃产品`);
  console.log(`📊 测试页数: ${results.length}`);
  
  // 按分类统计
  const categoryStats = {};
  allProducts.forEach(product => {
    const catName = product.category?.name || '未知分类';
    categoryStats[catName] = (categoryStats[catName] || 0) + 1;
  });

  console.log(`📊 分类统计:`);
  Object.entries(categoryStats).forEach(([catName, count]) => {
    console.log(`  - ${catName}: ${count} 个`);
  });

  // 显示产品列表
  if (allProducts.length > 0) {
    console.log(`\n📋 获取的产品列表 (前10个):`);
    allProducts.slice(0, 10).forEach((product, index) => {
      console.log(`  ${index + 1}. ${product.name} (${product.category?.name || '未知'})`);
    });
    if (allProducts.length > 10) {
      console.log(`  ... 还有 ${allProducts.length - 10} 个产品`);
    }
  }

  return json({
    ok: true,
    message: `多个分类分页测试完成`,
    summary: {
      totalPages: results.length,
      totalProducts,
      categoryStats,
      targetCategories: TARGET_CATEGORIES.length
    },
    productList: allProducts.map(p => ({
      id: p.id,
      name: p.name,
      status: p.status,
      category: p.category?.name,
      categoryId: p.category?.id,
      createdAt: p.createdAt
    })),
    details: results.map(r => ({
      page: r.page,
      count: r.count,
      hasNextPage: r.hasNextPage
    })),
  });
}
