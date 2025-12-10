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
  "11f0051540f1451891ff02ec8952cbfd",
  "11f00516440c3a909c3d02ec8952cbfd",
  "11f005e2765d7d169cb60a27abf4ff21",
  "11f009d9ab9b2ec48a370a85a86b1639",
  "11f00aa137df1c16b5aa0231e5337e95",
  "11f00aa308e1cc9aab180231e5337e95",
  "11f05228a4374af4b9ce0a23ed3d982d",
  "11f05211632edb38a8390a23ed3d982d",
  "11f04cbd153cf80090350613baed8537",
  "11f04cac7c10d6f28e1f0613baed8537",
  "11f04ca520d7fca4b90e02f45b652619",
  "11f04ca432e8d4789970060575f814cd",
  "11f047fa4b58e8e49a6d06532e02c2c7",
  "11f04be405598a04bb58060575f814cd",
  "11f047fa02373fe4b4950a39f5625ed7",
  "11f047f6dea1c19299c80a39f5625ed7",
  "11f047f394940dce97ce0a39f5625ed7",
  "11f0473ef720537ca9e90a2d35da27a7",
  "11f04738d4c81900989602da8f13a0b9",
  "11f047395974855896ad02da8f13a0b9",
  "11f047386bbe52b2bae30a2d35da27a7",
  "11f04737ab7bbe5499e202da8f13a0b9",
  "11f0466182be008eb19e06f402ddaeb9",
  "11f062a6159291f8a8ba0654a368d8a7",
  "11f062c2ab0d25889d3702a6c2b4bba5",
  "11f062c2f72687de97f802062f06602b",
  "11f062c3510af4e285c20654a368d8a7",
  "11f062dcf6dbd98680c4061ff62716b9",
  "11f062dd14a5fa1e99ca0654a368d8a7",
  "11f062dd5a3c8caaa66d02062f06602b",
  "11f0639008c5680c80100276c4c0a3d7",
  "11f06390c5fa1a3aabb60654a368d8a7",
  "11f065063ef9351cb0eb06abca58b059",
  "11f0676ccb29274683fd063a03451fd7",
  "11f0676d018d48ee8fde063a03451fd7",
  "11f0676d63c0228e9503022593ace15d",
  "11f0682bad51b96caaf10a9e3586357f",
  "11f0683eaee960fa94e006dff73d5b3b",
  "11f06ce50cd0014c8c73066d65f31035",
  "11f06da0a58ed4ec8dea025df10b1557",
  "11f06ce53ba92a84bf02025df10b1557",
  "11f06da10845666e8d6c025df10b1557",
  "11f06da13f2abea48a19025df10b1557",
  "11f06da17a8c9fb297a10606db38f9db",
  "11f06dacc6707b5ab4e80ad41b404c1d",
  "11f06daf5fc8d2828e0702f20fe67735",
  "11f06e60ec9a012aa7ad025df10b1557"
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
