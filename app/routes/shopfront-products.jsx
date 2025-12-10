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
  const fetchMode = url.searchParams.get("fetchMode") || "all";
  const startingCursor = url.searchParams.get("startingCursor") || "";
  const pagesParam = url.searchParams.get("pages") || "1";
  
  // 硬编码的产品ID数组 - 请在这里填写您要查询的产品ID
const PRODUCT_IDS = [
  "11f098e9b9fb353cbdcf06760bc1ba93",
  "11f099b80f5e0058ab79063094aff5bf",
  "11ef8131947e39f688470a1f4ac5468b",
  "11ef8133d42217baa42e0a61ef0b33db",
  "11ef8134033bd81087fe0a1f4ac5468b",
  "11ef8134c164cd2e98a602e7f7aebf81",
  "11ef81357475175cb76502e7f7aebf81",
  "11ef8135b5e3b748b67b02e7f7aebf81",
  "11ef81e84808fa90a6a9026d6c0c2051",
  "11ef82117f4c2b8eb91f026d6c0c2051",
  "11ef835e3bbf452e8ef0026d6c0c2051",
  "11ef8361cda65df8bdf50af5072670f1",
  "11ef8362009597568b990af5072670f1",
  "11ef83625033d8aea8fa0af5072670f1",
  "11ef83628343d0009042026d6c0c2051",
  "11ef8362ab7d09b0ab0e026d6c0c2051",
  "11ef838d574e9090b7b50af5072670f1",
  "11ef8697b08469668a0d0274308c35cb",
  "11ef91aa9230adbc81b50ad0c2dd1a97",
  "11ef91b554fbbf8ab0bd02e316387ad7",
  "11efa212dc8a7d988e6a0a74731cd04b",
  "11efa24199b68640b86b020b9602f431",
  "11efa86286a55d48979a02c64abc840b"
];

  const fetchProducts = async (accessToken, first = 50, after = null) => {
    console.log(`🔄 Fetching products with cursor: ${after || 'first page'}`);
    
    // 构建 GraphQL 查询变量
    const variables = {
      first: first,
      statuses: ["ACTIVE"]
    };
    
    // 如果有游标，添加游标参数
    if (after) {
      variables.after = after;
    }
    
    // 始终使用硬编码的产品ID数组
    variables.products = PRODUCT_IDS;
    
    return fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Shopfront-App"
      },
      body: JSON.stringify({
        query: `
query GetProducts($first: Int, $after: Cursor, $products: [ID], $statuses: [ProductStatusEnum]) {
  products(first: $first, after: $after, products: $products, statuses: $statuses) {
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
        tags { id name }
        image
        alternateImages
        createdAt
        updatedAt
        prices { quantity price priceEx decimalPlaceLength priceSet { id name } }
        barcodes { code quantity lastSoldAt promotionPrice outletPromotionPrices { outlet { id name } price } }
        inventory { outlet { id name } quantity singleLevel caseLevel reorderLevel reorderAmount maxQuantity }
        additionalFields {
          id
          name
          safeName
          type
          value
        }
      }
    }
    pageInfo { hasNextPage endCursor }
    totalCount
  }
}
        `,
        variables: variables
      })
    });
  };

  try {
    if (fetchMode === "partial") {
      // 部分获取模式：获取指定cursor开始的N页
      const pages = parseInt(pagesParam, 10);
      if (isNaN(pages) || pages < 1 || pages > 100) {
        return json({ 
          error: "页数必须是1-100之间的数字" 
        }, { status: 400 });
      }
      
      let cursor = startingCursor.trim() || null; // 如果没填cursor，则从第一页开始
      let allEdges = [];
      let totalCount = 0;
      let pageCount = 0;
      
      for (let i = 0; i < pages; i++) {
        pageCount++;
        console.log(`📄 获取第 ${pageCount} 页, cursor: ${cursor || '第一页'}`);
        
        const resp = await fetchProducts(tokens.access_token, 50, cursor);
        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          return json({
            error: `第 ${pageCount} 页返回非 JSON`,
            raw: text
          }, { status: 500 });
        }

        if (!data.data || !data.data.products) {
          return json({
            error: `第 ${pageCount} 页未返回 products 字段`,
            raw: data
          }, { status: 500 });
        }

        const edges = data.data.products.edges;
        const pageInfo = data.data.products.pageInfo;
        
        allEdges.push(...edges);
        
        // 只在第一页获取总数
        if (pageCount === 1 && data.data.products.totalCount) {
          totalCount = data.data.products.totalCount;
        }
        
        // 如果没有下一页，停止获取
        if (!pageInfo.hasNextPage) {
          console.log(`✅ 已到最后一页，共获取 ${pageCount} 页`);
          break;
        }
        
        cursor = pageInfo.endCursor || null;
        
        // 添加延迟避免速率限制
        if (i < pages - 1 && pageInfo.hasNextPage) {
          console.log("⏳ 等待2秒后获取下一页...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      return json({
        ok: true,
        mode: "partial",
        startingCursor: startingCursor || "第一页",
        pagesRequested: pages,
        pagesFetched: pageCount,
        count: allEdges.length,
        products: allEdges,
        totalCount: totalCount || allEdges.length,
        productsIds: PRODUCT_IDS,
        lastCursor: allEdges.length > 0 ? allEdges[allEdges.length - 1].cursor : null
      });

    } else {
      // 完整获取模式（原来的逻辑）
      let cursor = null;
      let hasNextPage = true;
      const allEdges = [];
      let totalCount = 0;
      let pageCount = 0;

      while (hasNextPage) {
        pageCount++;
        console.log(`📄 获取第 ${pageCount} 页, cursor: ${cursor || '第一页'}`);
        
        const resp = await fetchProducts(tokens.access_token, 50, cursor);
        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          return json({
            error: "GraphQL 返回非 JSON",
            raw: text
          }, { status: 500 });
        }

        if (!data.data || !data.data.products) {
          return json({
            error: "Shopfront API 未返回 products 字段",
            raw: data,
            pageCount
          }, { status: 500 });
        }

        const edges = data.data.products.edges;
        const pageInfo = data.data.products.pageInfo;
        
        allEdges.push(...edges);
        
        // 只在第一页获取总数
        if (pageCount === 1 && data.data.products.totalCount) {
          totalCount = data.data.products.totalCount;
        }

        hasNextPage = pageInfo.hasNextPage || false;
        cursor = pageInfo.endCursor || null;

        // 添加延迟避免速率限制
        if (hasNextPage) {
          console.log("⏳ 等待2秒后获取下一页...");
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      return json({
        ok: true,
        mode: "all",
        pageCount,
        count: allEdges.length,
        products: allEdges,
        totalCount,
        productsIds: PRODUCT_IDS,
        lastCursor: allEdges.length > 0 ? allEdges[allEdges.length - 1].cursor : null,
        errors: null
      });
    }

  } catch (err) {
    console.error("获取产品出错:", err);
    return json({ 
      error: "获取产品出错: " + err.message,
      mode: fetchMode
    }, { status: 500 });
  }
}
