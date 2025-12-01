// app/utils/shopfront.server.js
import fetch from "node-fetch";
import { getTokens } from "./shopfrontTokens.server.js";

export function getShopifyToken() {
  // 根据你的逻辑实现
  // 例如从数据库获取 token
  return process.env.SHOPIFY_ACCESS_TOKEN;
}
export async function getShopfrontProducts(vendor = "plonk") {
  const tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    throw new Error("请先完成授权");
  }

  const resp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "Shopfront-App-Test",
    },
    body: JSON.stringify({
      query: `
        {
          products {
            edges {
              node {
                id
                name
                description
                status
                type
                category { id name }
                brand { name }
                image
                alternateImages
                prices {
                  quantity
                  price
                  priceEx
                  decimalPlaceLength
                }
                barcodes {
                  code
                  quantity
                }
                inventory {
                  outlet { id name }
                  quantity
                }
              }
            }
          }
        }
      `,
    }),
  });

  const text = await resp.text();
  const data = JSON.parse(text);
  return (data.data?.products?.edges || []).map(e => e.node);
}
