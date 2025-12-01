// app/utils/shopfront.server.js
import fetch from "node-fetch";

export async function getShopfrontProducts() {
  const url = process.env.SHOPFRONT_API_URL;
  if (!url) throw new Error("未设置 SHOPFRONT_API_URL");

  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Shopfront API 错误: ${await resp.text()}`);
  }

  return resp.json();
}
