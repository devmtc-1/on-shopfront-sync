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
  const startPage = parseInt(url.searchParams.get("startPage") || "3", 10); // 新增：起始页
  const pages = parseInt(url.searchParams.get("pages") || "6", 10); // 新增：要获取的页数

  // 单个页面获取函数
  const fetchProductsPage = async (accessToken, cursor = null) => {
    const response = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Shopfront-App"
      },
      body: JSON.stringify({
        query: `
{
  products(first: ${first}${cursor ? `, after: "${cursor}"` : ""}) {
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
        `
      })
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`GraphQL 返回非 JSON: ${text.substring(0, 200)}`);
    }

    if (!data.data || !data.data.products) {
      throw new Error("Shopfront API 未返回 products 字段");
    }

    return {
      products: data.data.products.edges,
      pageInfo: data.data.products.pageInfo,
      totalCount: data.data.products.totalCount,
      errors: data.errors
    };
  };

  try {
    let allProducts = [];
    let currentCursor = after;
    let currentPage = 1;
    let hasNextPage = true;
    let totalCount = 0;
    let allErrors = [];

    console.log(`🎯 目标: 获取第 ${startPage} 页开始，共 ${pages} 页`);

    // 第一步：如果需要跳过前面的页面，先翻页到起始页
    if (startPage > 1) {
      console.log(`⏭️  需要跳过前 ${startPage - 1} 页...`);
      
      while (hasNextPage && currentPage < startPage) {
        console.log(`⏩  跳过第 ${currentPage} 页...`);
        
        const pageData = await fetchProductsPage(tokens.access_token, currentCursor);
        
        // 记录总产品数（只在第一页获取）
        if (currentPage === 1) {
          totalCount = pageData.totalCount;
          console.log(`📊 总产品数: ${totalCount}`);
        }
        
        // 只更新游标，不收集产品
        hasNextPage = pageData.pageInfo.hasNextPage;
        currentCursor = pageData.pageInfo.endCursor;
        currentPage++;
        
        // 页面间延迟
        if (hasNextPage && currentPage < startPage) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
      
      console.log(`✅ 已跳过到第 ${startPage} 页`);
    }

    // 第二步：从起始页开始获取指定页数的产品
    const targetEndPage = startPage + pages - 1;
    console.log(`📚 开始获取第 ${startPage} 到 ${targetEndPage} 页`);
    
    while (hasNextPage && currentPage <= targetEndPage) {
      console.log(`📄 获取第 ${currentPage} 页...`);
      
      const pageData = await fetchProductsPage(tokens.access_token, currentCursor);
      
      // 记录总产品数（如果还没获取过）
      if (totalCount === 0) {
        totalCount = pageData.totalCount;
        console.log(`📊 总产品数: ${totalCount}`);
      }
      
      // 收集产品
      allProducts = [...allProducts, ...pageData.products];
      
      // 收集错误
      if (pageData.errors) {
        allErrors = [...allErrors, ...pageData.errors];
      }
      
      // 更新游标和页码
      hasNextPage = pageData.pageInfo.hasNextPage;
      currentCursor = pageData.pageInfo.endCursor;
      currentPage++;
      
      // 页面间延迟
      if (hasNextPage && currentPage <= targetEndPage) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    console.log(`✅ 完成: 共获取 ${allProducts.length} 个产品 (第 ${startPage} 到 ${currentPage - 1} 页)`);

    return json({
      ok: true,
      startPage,
      endPage: currentPage - 1,
      pagesFetched: Math.min(pages, currentPage - startPage),
      count: allProducts.length,
      products: allProducts,
      pageInfo: {
        hasNextPage: hasNextPage,
        endCursor: currentCursor
      },
      totalCount: totalCount,
      errors: allErrors.length > 0 ? allErrors : null,
      message: `获取第 ${startPage} 到 ${currentPage - 1} 页，共 ${allProducts.length} 个产品`
    });

  } catch (err) {
    console.error("获取产品出错:", err);
    return json({ 
      error: "获取产品出错: " + err.message,
      details: err.stack 
    }, { status: 500 });
  }
}
