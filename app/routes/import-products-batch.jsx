// app/routes/import-products-batch.jsx
import { json } from "@remix-run/node";

export async function action({ request }) {
  const { products } = await request.json(); // products 是一个产品数组

  const results = [];
  for (const product of products) {
    try {
      // TODO: 替换为你的实际数据库导入逻辑
      // await db.product.upsert({ ... });
      results.push({ productId: product.id, success: true });
    } catch (error) {
      results.push({ productId: product.id, success: false, error: error.message });
    }
  }

  return json({ success: true, results });
}