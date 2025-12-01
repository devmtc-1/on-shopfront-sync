// app/utils/shopfrontTokens.server.js

// 存储 token（开发阶段用 global，这里不持久化）
globalThis.shopfrontTokens = globalThis.shopfrontTokens || {};

export const getTokens = (vendor) => {
  return globalThis.shopfrontTokens[vendor] || null;
};

export const storeAccessToken = (vendor, tokenData) => {
  globalThis.shopfrontTokens[vendor] = tokenData;
};

// 刷新 access_token
export const refreshToken = async (vendor) => {
  const oldTokens = getTokens(vendor);
  if (!oldTokens || !oldTokens.refresh_token) {
    throw new Error("No refresh_token found for vendor " + vendor);
  }

  const resp = await fetch("https://onshopfront.com/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      client_id: "ztrt5PaIGpZ7o3CosWClnOa6YXFe2ptj",
      client_secret: "YAIuIWuO21HQ5ZKhPuqeZ7Kg8iaC0crfdFMSjaM2",
      refresh_token: oldTokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error("Unable to refresh access token: " + text);
  }

  const newTokens = await resp.json();
  storeAccessToken(vendor, newTokens);
  console.log("✔ Access token refreshed for vendor:", vendor);
  return newTokens;
};
