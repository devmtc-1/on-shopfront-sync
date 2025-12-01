import { json } from "@remix-run/node";
import { importProductToShopify } from "../utils/importProductToShopify";

export async function action({ request }) {
  try {
    const { product } = await request.json();
    
    // 🔹 捕获可能的错误
    try {
      const shopifyResp = await importProductToShopify(product);
      return json({
        success: true,
        shopifyResp
      });
    } catch (err) {
      console.error("importProductToShopify 错误:", err);
      return json({ success: false, error: err.message, stack: err.stack }, { status: 500 });
    }

  } catch (err) {
    console.error("解析请求体失败:", err);
    return json({ success: false, error: "请求体解析失败: " + err.message, stack: err.stack }, { status: 500 });
  }
}
