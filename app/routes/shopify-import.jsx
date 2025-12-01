// app/routes/shopify-import.jsx
import { json } from "@remix-run/node";

export async function action({ request }) {
  try {
    // 只能在action中使用process.env
    const shopifyAccessToken = process.env.SHOPIFY_ACCESS_TOKEN; 
    const shopDomain = process.env.SHOPIFY_DOMAIN;

    if (!shopifyAccessToken || !shopDomain) {
      return json({ error: "Shopify环境变量未配置" }, { status: 500 });
    }

    const body = await request.json();
    const products = body.products;

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

// 添加一个空的默认导出，让React Router知道这是有效的路由
export default function ShopifyImport() {
  return null;
}