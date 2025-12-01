// app/routes/test-products.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

export async function loader() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ error: "请先授权再测试" }, { status: 401 });
  }

  let cursor = null;
  let hasNextPage = true;
  let page = 0;

  const results = [];

  console.log("🚀 开始测试 Shopfront 分页（不导入产品）");

  while (hasNextPage) {
    page++;

    // Query（保持你目前的字段，这样能验证真实同步行为）
    const query = `
      {
        products(first: 200 ${cursor ? `, after: "${cursor}"` : ""}) {
          edges {
            cursor
            node { id }
          }
          pageInfo { hasNextPage endCursor }
          totalCount
        }
      }
    `;

    const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    });

    const text = await resp.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("❌ GraphQL 返回非 JSON：", text);
      return json({ error: "GraphQL 返回非 JSON", raw: text }, { status: 500 });
    }

    const edges = data.data?.products?.edges || [];
    const pageInfo = data.data?.products?.pageInfo;
    const totalCount = data.data?.products?.totalCount ?? 0;

    hasNextPage = pageInfo?.hasNextPage ?? false;
    cursor = pageInfo?.endCursor ?? null;

    console.log(
      `第 ${page} 页：${edges.length} 条，hasNextPage = ${hasNextPage}`
    );

    results.push({
      page,
      count: edges.length,
      hasNextPage,
    });

    // 安全避免死循环
    if (page > 20) {
      console.log("⚠️ 停止：超过 20 页，可能请求异常");
      break;
    }
  }

  console.log("🎉 分页测试结束");

  return json({
    ok: true,
    message: "分页测试完成（无导入操作）",
    pagesTested: results.length,
    details: results,
  });
}
