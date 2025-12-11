// app/utils/shopfrontWebhooks.server.js
import { getTokens } from "./shopfrontTokens.server";

export async function registerShopfrontWebhooks(webhookUrl) {
  const vendor = "plonk";
  const tokens = await getTokens(vendor);
  
  if (!tokens?.access_token) throw new Error("请先完成授权");

  const events = ["PRODUCT_CREATED", "PRODUCT_UPDATED", "PRODUCT_DELETED"];

  for (const event of events) {
    await registerWebhook(event, webhookUrl, tokens.access_token);
  }
}

async function registerWebhook(event, url, accessToken) {
  const mutation = `
    mutation RegisterWebhook {
      registerWebhook(
        name: "${event} Webhook", 
        url: "${url}", 
        events: [${event}]
      ) {
        id
        name
        url
        events
        active
      }
    }
  `;

  console.log(`注册Webhook: ${event} -> ${url}`);

  const response = await fetch(`https://plonk.onshopfront.com/api/v2/graphql`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: mutation })
  });

  const data = await response.json();
  
  if (data.errors) {
    console.error(`注册Webhook ${event} 失败:`, data.errors);
    throw new Error(`Webhook注册失败: ${data.errors[0].message}`);
  } else {
    console.log(`✅ 注册Webhook成功: ${event}`, data.data.registerWebhook);
    return data.data.registerWebhook;
  }
}
