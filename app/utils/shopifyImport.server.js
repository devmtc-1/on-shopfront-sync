// app/utils/shopifyImport.server.js
import fetch from "node-fetch";

export async function importProductToShopify(product) {
  const domain = process.env.SHOPIFY_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  if (!domain || !token) throw new Error("请先设置 Shopify 环境变量");

  const shopifyProduct = {
    product: {
      title: product.name,
      body_html: product.description || "",
      vendor: product.brand?.name || "",
      tags: product.category?.name ? [product.category.name] : [],
      variants: product.prices.map(p => ({
        price: p.price.toString(),
        sku: product.barcodes?.[0]?.code || "",
        inventory_quantity: product.inventory?.[0]?.quantity || 0
      }))
    }
  };

  const resp = await fetch(`https://${domain}/admin/api/2025-07/products.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: JSON.stringify(shopifyProduct)
  });

  if (!resp.ok) {
    throw new Error(`Shopify API 错误: ${await resp.text()}`);
  }

  return await resp.json();
}
