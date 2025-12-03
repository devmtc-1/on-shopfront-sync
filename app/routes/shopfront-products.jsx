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
  const CATEGORY_ID = "11e96ba509ddf5a487c00ab419c1109c";
  const page = after ? `after=${after}` : "page=1";

  const fetchProducts = async (accessToken) => {
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
products(first: ${first}${after ? `, after: "${after}"` : ""}, categories: ["${CATEGORY_ID}"], statuses: [ACTIVE]) {
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
  };

  try {
    const resp = await fetchProducts(tokens.access_token);
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

    // 🟡 确保 products 字段存在
    if (!data.data || !data.data.products) {
      return json({
        error: "Shopfront API 未返回 products 字段",
        raw: data,
        page
      }, { status: 500 });
    }

    const products = data.data.products.edges;
    const pageInfo = data.data.products.pageInfo;
    const totalCount = data.data.products.totalCount;

    return json({
      ok: true,
      page,
      count: products.length,
      products,
      pageInfo,
      totalCount,
      errors: data.errors ?? null
    });
  } catch (err) {
    return json({ error: "获取产品出错: " + err.message }, { status: 500 });
  }
}
