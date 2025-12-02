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
  const pages = parseInt(url.searchParams.get("pages") || "1", 10);
  const batchMode = url.searchParams.get("batch") === "true";
  const startPage = parseInt(url.searchParams.get("startPage") || "1", 10); // 新增：起始页
  const endPage = parseInt(url.searchParams.get("endPage") || "1", 10);     // 新增：结束页
  const pageMode = url.searchParams.get("pageMode") === "true";            // 新增：页码模式

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

    if (data.errors) {
      throw new Error(`GraphQL 错误: ${JSON.stringify(data.errors)}`);
    }

    return {
      products: data.data.products.edges,
      pageInfo: data.data.products.pageInfo,
      totalCount: data.data.products.totalCount
    };
  };

  try {
    // 模式1：页码模式 - 获取指定页码范围
    if (pageMode && startPage > 0 && endPage >= startPage) {
      console.log(`📚 页码模式: 获取第 ${startPage} 到 ${endPage} 页`);
      
      let allProducts = [];
      let currentCursor = after;
      let currentPage = 1;
      let hasNextPage = true;
      let totalCount = 0;

      // 第一步：先翻页到起始页
      while (hasNextPage && currentPage < startPage) {
        console.log(`⏭️  跳过第 ${currentPage} 页...`);
        
        const pageData = await fetchProductsPage(tokens.access_token, currentCursor);
        hasNextPage = pageData.pageInfo.hasNextPage;
        currentCursor = pageData.pageInfo.endCursor;
        currentPage++;
        
        // 跳过页面时也添加延迟
        if (hasNextPage && currentPage < startPage) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }

      // 第二步：从起始页开始获取产品
      while (hasNextPage && currentPage <= endPage) {
        console.log(`📄 获取第 ${currentPage} 页...`);
        
        const pageData = await fetchProductsPage(tokens.access_token, currentCursor);
        
        // 记录总数
        if (totalCount === 0) {
          totalCount = pageData.totalCount;
        }
        
        allProducts = [...allProducts, ...pageData.products];
        hasNextPage = pageData.pageInfo.hasNextPage;
        currentCursor = pageData.pageInfo.endCursor;
        currentPage++;
        
        // 页面间延迟
        if (hasNextPage && currentPage <= endPage) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ 页码模式完成: 共获取 ${allProducts.length} 条产品数据`);
      
      return json({
        ok: true,
        mode: "pageRange",
        startPage,
        endPage,
        pagesFetched: endPage - startPage + 1,
        count: allProducts.length,
        products: allProducts,
        hasNextPage: hasNextPage,
        nextCursor: currentCursor,
        totalCount: totalCount,
        message: `成功获取第 ${startPage} 到 ${endPage} 页，共 ${allProducts.length} 条产品`
      });

    }
    // 模式2：批量模式 - 获取多页
    else if (batchMode && pages > 1) {
      console.log(`🔄 批量模式: 获取 ${pages} 页，每页 ${first} 条`);
      
      let allProducts = [];
      let currentCursor = after;
      let currentPage = 1;
      let hasNextPage = true;
      let totalCount = 0;

      while (hasNextPage && currentPage <= pages) {
        console.log(`📄 获取第 ${currentPage} 页...`);
        
        const pageData = await fetchProductsPage(tokens.access_token, currentCursor);
        
        // 第一页获取总数量
        if (currentPage === 1) {
          totalCount = pageData.totalCount;
        }
        
        allProducts = [...allProducts, ...pageData.products];
        hasNextPage = pageData.pageInfo.hasNextPage;
        currentCursor = pageData.pageInfo.endCursor;
        currentPage++;
        
        // 页面间延迟
        if (hasNextPage && currentPage <= pages) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`✅ 批量模式完成: 共 ${allProducts.length} 条产品数据`);
      
      return json({
        ok: true,
        mode: "batch",
        pagesFetched: currentPage - 1,
        totalPagesRequested: pages,
        count: allProducts.length,
        products: allProducts,
        hasNextPage: hasNextPage,
        nextCursor: currentCursor,
        totalCount: totalCount,
        message: `成功获取 ${pages} 页，共 ${allProducts.length} 条产品`
      });

    } else {
      // 模式3：单页模式
      const pageData = await fetchProductsPage(tokens.access_token, after);
      
      return json({
        ok: true,
        mode: "single",
        count: pageData.products.length,
        products: pageData.products,
        pageInfo: pageData.pageInfo,
        totalCount: pageData.totalCount,
        errors: null
      });
    }

  } catch (err) {
    console.error("获取产品出错:", err);
    return json({ 
      error: "获取产品出错: " + err.message,
      details: err.stack 
    }, { status: 500 });
  }
}
