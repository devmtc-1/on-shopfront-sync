// app/routes/shopfront-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

export async function loader({ request }) {
  const vendor = "plonk";
  
  // ⚠️ 关键修改：添加 await，因为 getTokens 现在是异步函数了！
  let tokens = await getTokens(vendor);
  
  console.log("🔍 [shopfront-products] Token获取结果:", {
    获取到token: !!tokens,
    access_token长度: tokens?.access_token?.length,
    expires_in: tokens?.expires_in
  });
  
  if (!tokens?.access_token) {
    console.error("❌ [shopfront-products] 没有有效的access_token");
    return json({ error: "请先完成授权" }, { status: 401 });
  }

  const url = new URL(request.url);
  const fetchMode = url.searchParams.get("fetchMode") || "all";
  const startingCursor = url.searchParams.get("startingCursor") || "";
  const pagesParam = url.searchParams.get("pages") || "1";
  
  // 硬编码的产品ID数组 - 请在这里填写您要查询的产品ID
const PRODUCT_IDS = [
  "11f06e6130b653f4a0ee0606db38f9db",
  "11f06e6152e5e7c894ad025df10b1557",
  "11f0726118ee4868aa52026543e456e5",
  "11f0726169029246a48006bce8cb6901",
  "11f0733c29011df8aedb029f9b3fad05",
  "11f089efbb6a835e9bf802e9e77e555b",
  "11f010e97126bb70b5980af44b34eeb1",
  "11f010e9b8acd79a8b0f029aa4083c9b",
  "11f010f866759b9cb94b02a090fc74af",
  "11f0159bacabd53ea665022f94a57c2f",
  "11f015a07c051a94b836022f94a57c2f",
  "11f015a45daaefb69f4c022f94a57c2f",
  "11f015a59728442c9a2e022f94a57c2f",
  "11f015b9942f72188cd502079fb54693",
  "11f015ccc3a22258b5e502079fb54693",
  "11f0165a7e54def0b27f022f94a57c2f",
  "11f0168e411607d8aac902ef3ca1e10f",
  "11f01a5258939af2847d0204ee5a076f",
  "11f01a5294ae73fe965c0ae3f9e047cb",
  "11f01a52c84da22aa1630ae3f9e047cb",
  "11f01a536c9748ea9cf90ae3f9e047cb",
  "11f01a53c7a6249a913f0ae3f9e047cb",
  "11f01a541039a4169ef80ae3f9e047cb",
  "11f01a545933336ca5bf0ae3f9e047cb",
  "11f03059bf2c8342926e06ca501db035",
  "11eb2f0ebd3f53c684a002f518ab157c",
  "11e72bca2ff0e296a33d0a1468096c0d",
  "11ecd723f8171c40815c0ab419c1109c",
  "11e718dcb1a14732b72c0a1468096c0d",
  "11f07346ae97ee6a9bfc0a5908281ed1",
  "11f078c0d6b8d29abe9006b08220094b",
  "11f0aa0dc4682cca939e0a30c1672c57",
  "11f0aa0dc685e2ea84800644992789b7",
  "11f0aa0dc70d7c96918d0a30c1672c57",
  "11f0ab0adde8710ca1f802cf314dcc43",
  "11f0afa36752e962a2240a957c318155",
  "11f0c0176e5311ae9fa20a995393c9a9",
  "11f0c021b56f69348cfd06d48075af87",
  "11f0c4fbe6e7ec28a36f0626e1502ee1",
  "11f0ca787a93f666b1ba0a5f151ba4bd",
  "11f0cb2599d4069e84ec024e7e4cb233",
  "11f0cb26485e5782a12f061a5d9eea45",
  "11f0cb26d6ab4bc69cca02b1f123e371"
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
