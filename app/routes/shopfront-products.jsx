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
  "11efa863a19b9f4e985b0a9035696eeb",
  "11efa865aa329dfe97640294a14aa32b",
  "11efa8668253b5c488e60294a14aa32b",
  "11efa86c65db1774beab0a9035696eeb",
  "11efa86f1faf2486beb40a9035696eeb",
  "11efad1c813327f089a10a129a2627e7",
  "11efb29e5ed25a32933d02aaddbc6641",
  "11efb36f9ee132de9c060a968d8ac109",
  "11efb36fef013598af4c029741001c8f",
  "11efb37025b845f4acde0a968d8ac109",
  "11efb3707731113684bb0a968d8ac109",
  "11efb370ca60df76ac85029741001c8f",
  "11efbda8158e28b48c0c0a28721db945",
  "11efbdad241310b6933f0a59d21dd177",
  "11efbdb7bc9e585e833b0a28721db945",
  "11efbdb87e5b23f095b30a28721db945",
  "11efbdb8a507335eae030a59d21dd177",
  "11efbdb8d9f8a81882ec028161122dab",
  "11efbdc679597a9c8a8e028161122dab",
  "11efbdb9c974c61a96b90a28721db945",
  "11efbdc6f0b831b485150a59d21dd177",
  "11efbdc75460a354be990a28721db945",
  "11efbdc7967e50069e2b028161122dab",
  "11efbdc80d66f8e49923025738a4dfb9",
  "11efbe51fa11841e9aa80a7063ca2e9b",
  "11efbe522e1571bcbcc3022719cdb74b",
  "11efbe55ced875929bcd0a7063ca2e9b",
  "11efbe5613e3a7ba8416022719cdb74b",
  "11efbe56bb11323cba3c0a7063ca2e9b",
  "11eff569d401e49aa7840ae8f92a9f43",
  "11eff56a0b7cccdca5df0a7d000cb51d",
  "11effa21d86d600699c30a68936242ef",
  "11effa259515176e9dd70af24384635b",
  "11effa26b76cec14ba5e02a3c8c52e17",
  "11effa274e325f08b9220a68936242ef",
  "11effa2781930186b4250af24384635b",
  "11effa27b392a0ecaa580af24384635b",
  "11effa28cd42232cb5470a68936242ef",
  "11effa28f6cf175495350a68936242ef",
  "11effa297fab95e8add90af24384635b",
  "11effa29428e4db8b1700a68936242ef",
  "11efffc4e0242a16b8ee028219303283",
  "11efffcb12217f048fc0028219303283",
  "11efffc6950dd48aa3580a50cf01d499"
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
