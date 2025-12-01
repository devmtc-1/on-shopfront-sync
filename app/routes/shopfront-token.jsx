import { json } from "@remix-run/node";
import fetch from "node-fetch";

globalThis.shopfrontTokens = globalThis.shopfrontTokens || {};

const getTokens = (vendor) => globalThis.shopfrontTokens[vendor] || null;

const storeAccessToken = (vendor, tokens) => {
  globalThis.shopfrontTokens[vendor] = { ...tokens, obtainedAt: Date.now() };
};

const refreshToken = async (vendor) => {
  const oldTokens = getTokens(vendor);
  if (!oldTokens?.refresh_token) {
    throw new Error("没有 refresh_token，无法刷新");
  }

  const resp = await fetch("https://onshopfront.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
      client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2",
      refresh_token: oldTokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error("刷新 token 失败: " + txt);
  }

  const data = await resp.json();
  storeAccessToken(vendor, data);
  return data;
};

export async function loader({ request }) {
  const url = new URL(request.url);
  const vendor = url.searchParams.get("vendor") || "plonk";

  let tokens = getTokens(vendor);
  if (!tokens) return json({ error: "Token not found. 请先完成授权。" }, { status: 401 });

  const now = Date.now();
  if (tokens.expires_in && tokens.obtainedAt) {
    const expiresAt = tokens.obtainedAt + tokens.expires_in * 1000;
    if (now >= expiresAt) {
      try {
        tokens = await refreshToken(vendor);
      } catch (err) {
        return json({ error: err.message }, { status: 500 });
      }
    }
  }

  return json(tokens);
}
