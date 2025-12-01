import { redirect, json } from "@remix-run/node";
import fetch from "node-fetch";

globalThis.shopfrontStates = globalThis.shopfrontStates || {};
globalThis.shopfrontTokens = globalThis.shopfrontTokens || {};

function getState(vendor) {
  return globalThis.shopfrontStates[vendor]?.state || null;
}

function deleteState(vendor) {
  if (!globalThis.shopfrontStates[vendor]) return;
  clearTimeout(globalThis.shopfrontStates[vendor].timeout);
  delete globalThis.shopfrontStates[vendor];
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const vendor = url.searchParams.get("vendor") || "plonk";

  if (!code || !state) return json({ error: "Missing parameters" }, { status: 400 });

  const expectedState = getState(vendor);
  deleteState(vendor);

  if (!expectedState || expectedState !== state) {
    return json({ error: "Invalid state" }, { status: 403 });
  }

  try {
    const resp = await fetch("https://onshopfront.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: "eXYJMyar5WOhLu67vgU5M1rVgvEYuETa",
        client_secret: "h8gNsZQP8NWIpjfWLV15oME1oCC4m8r1Tp8KcXmr",
        redirect_uri:
          "https://on-shopfront-sync-production.up.railway.app/shopfront-callback",
        grant_type: "authorization_code",
        code,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return json({ error: text }, { status: resp.status });
    }

    const tokenData = await resp.json();

    // 按 vendor 保存 token
    globalThis.shopfrontTokens[vendor] = { ...tokenData, obtainedAt: Date.now() };
    console.log("✔ 已成功获取 token:", tokenData);

    return redirect("/"); // 授权成功后回首页
  } catch (err) {
    return json({ error: err.message }, { status: 500 });
  }
}
