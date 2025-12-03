// app/routes/shopfront-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

export async function loader({ request }) {
  const vendor = "plonk";
  let tokens = getTokens(vendor);
  if (!tokens?.access_token) {
    return json({ error: "请先完成授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const first = parseInt(url.searchParams.get("first") || "50", 10);
  const after = url.searchParams.get("after") || null;
  
  // 从URL参数获取分类ID，支持多个分类
  let categoryIds = [];
  const categoryParam = url.searchParams.get("categories");
  
  console.log("📊 收到URL参数 categories:", categoryParam);
  
  if (categoryParam) {
    // 支持逗号分隔的多个分类ID
    categoryIds = categoryParam.split(',').map(id => id.trim()).filter(id => id);
    console.log("📊 解析后的分类IDs:", categoryIds);
  } else {
    // 如果没有指定，使用默认分类
    categoryIds = ["11e96ba509ddf5a487c00ab419c1109c"]; // 默认分类
    console.log("📊 使用默认分类ID:", categoryIds);
  }

  const page = after ? `after=${after}` : "page=1";

  const fetchProducts = async (accessToken) => {
    // 构建GraphQL查询
    let queryParts = [
      `first: ${first}`,
      after ? `after: "${after}"` : null,
      categoryIds.length > 0 ? `categories: ${JSON.stringify(categoryIds)}` : null,
      `statuses: [ACTIVE]`
    ].filter(Boolean);
    
    const query = `
{
  products(${queryParts.join(', ')}) {
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
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
    `;

    console.log("📝 发送的GraphQL查询:");
    console.log(query);
    
    return fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Shopfront-App"
      },
      body: JSON.stringify({ query })
    });
  };

  try {
    const resp = await fetchProducts(tokens.access_token);
    const text = await resp.text();
    
    console.log("📥 收到响应，状态:", resp.status);
    console.log("📥 响应前200字符:", text.substring(0, 200));
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("❌ JSON解析失败，完整响应:", text);
      return json({
        error: "GraphQL 返回非 JSON",
        raw: text.substring(0, 500)
      }, { status: 500 });
    }

    if (data.errors) {
      console.error("❌ GraphQL错误:", data.errors);
      return json({
        error: "GraphQL 错误",
        details: data.errors,
        queryCategories: categoryIds
      }, { status: 500 });
    }

    if (!data.data || !data.data.products) {
      console.error("❌ API返回数据结构错误:", data);
      return json({
        error: "Shopfront API 未返回 products 字段",
        raw: data,
        page,
        categories: categoryIds
      }, { status: 500 });
    }

    const products = data.data.products.edges;
    const pageInfo = data.data.products.pageInfo;
    const totalCount = data.data.products.totalCount;

    console.log(`✅ 成功获取 ${products.length} 个产品`);
    console.log(`📊 总产品数: ${totalCount}`);
    console.log(`📊 是否有下一页: ${pageInfo?.hasNextPage}`);

    // 按分类分组产品，用于统计
    const productsByCategory = {};
    products.forEach(edge => {
      const categoryId = edge.node.category?.id;
      if (categoryId) {
        if (!productsByCategory[categoryId]) {
          productsByCategory[categoryId] = {
            name: edge.node.category?.name || '未知',
            count: 0,
            products: []
          };
        }
        productsByCategory[categoryId].count++;
        productsByCategory[categoryId].products.push({
          id: edge.node.id,
          name: edge.node.name
        });
      }
    });

    console.log("📊 产品按分类分布:");
    Object.entries(productsByCategory).forEach(([categoryId, stats]) => {
      console.log(`  ${stats.name}: ${stats.count} 个产品`);
    });

    return json({
      ok: true,
      page,
      count: products.length,
      products,
      pageInfo,
      totalCount,
      categories: categoryIds,
      categoryStats: productsByCategory,
      errors: data.errors ?? null
    });
  } catch (err) {
    console.error("❌ 获取产品出错:", err);
    return json({ 
      error: "获取产品出错: " + err.message,
      categories: categoryIds 
    }, { status: 500 });
  }
}
