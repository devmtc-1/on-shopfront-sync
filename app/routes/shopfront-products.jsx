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
  "11edce9326de654482c502cf268bcfdc",
  "11edd9831fcc33089fb60604c452ea72",
  "11edd9b22082915ab0920604c452ea72",
  "11ede00efda7842098760604c452ea72",
  "11edf051facbde42b05806dc882a283e",
  "11edf075a74cbf8888cc02e084ea5e6a",
  "11edf5132064833caabe06dc882a283e",
  "11edf52b8ac07c968f1206dc882a283e",
  "11edf540fee1b26a943402cef1e5fc6a",
  "11edf541e042af0c834802cef1e5fc6a",
  "11edf54226f484c0836a02e084ea5e6a",
  "11edf5425df279c89f8b02cef1e5fc6a",
  "11edf5ee5115bd6c9dc802cef1e5fc6a",
  "11edfc25ebef5bc691e106dc882a283e",
  "11ee001e6b5aa96eb4660a77e9eb095a",
  "11ee10c4a5c774e0919202302d6449d4",
  "11ee26b1aca8f83a8b0f02b4bd59485a",
  "11ee47a0af0a10c280270af3b19217f5",
  "11ee54346553dde698cf02d551ec8f5d",
  "11ee58181282e9b28e8d02d551ec8f5d",
  "11ee58182ab667e8813802d551ec8f5d",
  "11ee58291a29fd5291ff02d551ec8f5d",
  "11ee5d92608f34389d7c02210142e921",
  "11ee68afe12ec80683c902dc76f4639d",
  "11ee68b03a4edcb4bebe0a13f452fb91",
  "11ee68b0620cd33cbf6202dc76f4639d",
  "11ee696c813d7902a61a0272f709290b",
  "11ee6efd11b965be94320279643ed985",
  "11ee79b923c80fa08c120a7b14adbc3f",
  "11ee79b923c882d28dff0a7b14adbc3f",
  "11ee79b923c887788e470a7b14adbc3f",
  "11ee79b923c889d09ca70a7b14adbc3f",
  "11ee7eb9d9ea9f509a000a7e5c3c2383",
  "11ee8a5bfbeef28897c50acd79369a5f",
  "11ee94b39c853bce9055024bbda938c5",
  "11ee9549698b9b6eaab40ac73a3fff6d",
  "11ee9a2ab66f548a8008024bbda938c5",
  "11ee9ad0fc2f999898c502732fa9e3cf",
  "11ee9bcdd41d7dc8807602ba67981b37",
  "11eec17a1b0e3494b71b0a514ff761d5",
  "11eedc07e6a5e348ad7602644897e5e1",
  "11eee28b4a0542a6bf470a49f82337af",
  "11eeebc11bb3ead09e520a6b984c0cff",
  "11eefd0962aa489093700a0e6bd84365",
  "11edb26f1051d8b481e502fcfc76f0ea",
  "11ee05a1d6a7b4908f1202a6afb17ae6",
  "11edbe2551390750a6cb027319e7da80",
  "11ee1bb8367d699cad220a4958beff20",
  "11eddfe8b9b7cb4298b80604c452ea72",
  "11ee79faee115bd6a3ab0a826f07ce71",
  "11ee79d076ab04c292a40a7b14adbc3f",
  "11ee792f3f184a66a09d02856e57a745",
  "11ee746a85a5c400936102e930f23c61",
  "11ee6e05ab08eb5cb59f0279643ed985",
  "11ee69696466405a94c00272f709290b",
  "11ee689f8eb663aa98ae0a13f452fb91",
  "11ee689ec0cdb2fe997f0260ebc3279f",
  "11ee689e95b18d668bb80260ebc3279f",
  "11ee6333201c02ea9eba0afd38b21307",
  "11ee63066c6722b09b250260ebc3279f",
  "11ee5d8d0170c93aa9b602210142e921",
  "11ee58337d8cb8629c1c02d551ec8f5d",
  "11ee582850fb14a295270a9a1a7451dd",
  "11ee8a5d3a6dc6789769026b19e4ea53",
  "11ee8f2d6f46c6d6b557024c227fcd95",
  "11eeb1000644f366bb0c0aeb275938ab",
  "11eeb1002da55fa49e950aeb275938ab",
  "11eeb5a34f510516850b0a332289bfff",
  "11eebb1927c9d7868bfe02a57b8f702b",
  "11eec6122435310296b202b0c126c1a7",
  "11eec61303002f36b7310a4db1c3526f",
  "11eec6fa064b555c926c0a4db1c3526f",
  "11eecb99fbd1cfdaab480aac9f66e799",
  "11eed12c5bd4ab04a1a8022f61bcf6e3",
  "11eecba8a6c5cd20891602b98204185b",
  "11eed12ee1c4e254bde70a136f2c7abf",
  "11eed12f27914e6c8a1f0a136f2c7abf",
  "11eed134772b1980a716022f61bcf6e3",
  "11eed135078895b6a4270a136f2c7abf",
  "11ef7099a6379cbca18202082c151a73",
  "11ef7098dc8c9c3cb4db0a55f23020e5",
  "11ef6bf93497dce2a1550a55f23020e5",
  "11ef6b453cb9eb40a5e60a55f23020e5",
  "11ef6b3b5c5f0ee4b2e90a55f23020e5",
  "11ef66702ed4242aa350023db9bc8553",
  "11ef65b8a4303794a8a102248abdd825",
  "11ef65b8421052ceb9280aa70c74c6a3",
  "11ef65b3b8a0bce4a8b70aa70c74c6a3",
  "11ef65ac3e73d99eb11502248abdd825",
  "11ef65abda4444c2a01402080c230e63",
  "11ef59d8519c567a91860aaf5cd840dd",
  "11ef5610864fdc1480580262aa9618e3",
  "11ef4fc54354dfe68b9a0a8aba952ed9",
  "11ef4fc5055f3fecb5d70a8aba952ed9",
  "11ef4fa703af559c9307025198ec7bfd",
  "11ef4589a094e340a9db02f31c1b09cb",
  "11ef45891935a5a683680a0f27f53989",
  "11ef45869d2ec2be9b4b0289dfdb01df",
  "11ef4583997c13e0bb830289dfdb01df",
  "11ef3ffaee988aeaa0c90a75553a8f6d",
  "11ef3ffaa2a6cffcad380a75553a8f6d",
  "11eef2dbe92e40169c5d0a51c473c761",
  "11eef78c865587e69a8a0213ca2dee43",
  "11eef7b031ea299091a70213ca2dee43",
  "11eef7b4c573520a8ce90ad378314d41",
  "11eef7b591dc062aa5950ad378314d41",
  "11ef036df7e6fb3290290adbedb8fc35",
  "11ef036e256c2848b4a20af23ae16ed1",
  "11ef038fdf92bdc48aa90af23ae16ed1",
  "11ef0823c6385184b4b30a0d7414ca0f",
  "11ef08dc2ae4589ab5b702c8b2dc5e85",
  "11ef0f147aca5cf4a57d0aad151eb7cf",
  "11ef0f14ba7ac9d882960a6075a64afd",
  "11ef18d508bafebebf280aad151eb7cf",
  "11ef18d63a3d40a485f90a5fb1b67349",
  "11ef196dedeb7016a70e0a6075a64afd",
  "11ef1981f788d87a94a10a471cc0764d",
  "11ef23a0db65aa0a967f0259e6da5571",
  "11ef23b3068cfa0088810aa3991c02fd"
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
