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
  const categoriesParam = url.searchParams.get("categories");
  const fetchMode = url.searchParams.get("fetchMode") || "all";
  const startingCursor = url.searchParams.get("startingCursor");
  const pagesParam = url.searchParams.get("pages");
  
  let CATEGORY_IDS = [];
  if (categoriesParam) {
    CATEGORY_IDS = categoriesParam
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
  }
  
  if (CATEGORY_IDS.length === 0) {
    CATEGORY_IDS = [
      "11e96ba509ddf5a487c00ab419c1109c",
      "11e718d3cac71ecaa6100a1468096c0d",
      "11e718d4766d6630bb9e0a1468096c0d",
    ];
  }

  const fetchProducts = async (accessToken, first = 50, after = null) => {
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
{
  products(first: ${first}${after ? `, after: "${after}"` : ""}, categories: ${JSON.stringify(CATEGORY_IDS)}, statuses: [ACTIVE]) {
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
        `
      })
    });
  };

  try {
    if (fetchMode === "partial" && startingCursor) {
      // 部分获取模式：获取指定cursor开始的N页
      const pages = parseInt(pagesParam || "1", 10);
      let cursor = startingCursor;
      let allEdges = [];
      let totalCount = 0;
      let pageCount = 0;
      
      for (let i = 0; i < pages; i++) {
        console.log(`📄 获取第 ${i + 1} 页, cursor: ${cursor}`);
        
        const resp = await fetchProducts(tokens.access_token, 50, cursor);
        const text = await resp.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch (err) {
          return json({
            error: `第 ${i + 1} 页返回非 JSON`,
            raw: text
          }, { status: 500 });
        }

        if (!data.data || !data.data.products) {
          return json({
            error: `第 ${i + 1} 页未返回 products 字段`,
            raw: data
          }, { status: 500 });
        }

        const edges = data.data.products.edges;
        const pageInfo = data.data.products.pageInfo;
        
        allEdges.push(...edges);
        
        // 只在第一页获取总数
        if (i === 0 && data.data.products.totalCount) {
          totalCount = data.data.products.totalCount;
        }
        
        // 如果没有下一页，停止获取
        if (!pageInfo.hasNextPage) {
          pageCount = i + 1;
          console.log(`✅ 已到最后一页，共获取 ${pageCount} 页`);
          break;
        }
        
        cursor = pageInfo.endCursor;
        pageCount = i + 1;
        
        // 添加延迟避免速率限制
        if (i < pages - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      return json({
        ok: true,
        mode: "partial",
        startingCursor,
        pagesRequested: pages,
        pagesFetched: pageCount,
        count: allEdges.length,
        products: allEdges,
        totalCount,
        categories: CATEGORY_IDS,
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
        console.log(`📄 获取第 ${pageCount} 页, cursor: ${cursor ? cursor.substring(0, 20) + '...' : '第一页' }`);
        
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
        categories: CATEGORY_IDS,
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
