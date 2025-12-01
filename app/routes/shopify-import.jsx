import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getShopifyToken } from "../utils/shopify.server"; // 你需要在 utils 创建 Shopify token 方法

export async function action({ request }) {
  try {
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN; 
    const shopDomain = process.env.SHOPIFY_DOMAIN; // 例如 yourstore.myshopify.com

    const body = await request.json();
    const products = body.products; // 从前端传过来的 Shopfront 产品

    const results = [];

    for (const product of products) {
      const shopifyProduct = {
        title: product.name,
        body_html: product.description || "",
        images: product.image ? [{ src: product.image }] : [],
        variants: product.prices.map(p => ({
          price: p.price.toString(),
          sku: product.barcodes?.[0]?.code || "",
          inventory_quantity: product.inventory?.[0]?.quantity || 0,
        })),
      };

      const resp = await fetch(`https://${shopDomain}/admin/api/2025-10/products.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Shopify-Access-Token": shopifyAccessToken,
        },
        body: JSON.stringify({ product: shopifyProduct }),
      });

      const data = await resp.json();
      results.push(data);
    }

    return json({ success: true, results });
  } catch (err) {
    console.error(err);
    return json({ error: err.message }, { status: 500 });
  }
}
