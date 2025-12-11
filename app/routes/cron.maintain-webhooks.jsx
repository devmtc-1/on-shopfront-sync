// app/routes/cron.maintain-webhooks.jsx
import { maintainWebhooks } from "../utils/webhookMaintenance.server";

export async function loader({ request }) {
  console.log("🛠️ Cron触发: Webhook维护任务");
  
  // 简单时间戳验证，避免被随意调用
  const url = new URL(request.url);
  const expectedHour = 3; // 只在凌晨3点运行
  const currentHour = new Date().getHours();
  
  if (currentHour !== expectedHour && !url.searchParams.has("force")) {
    console.log(`⏰ 非维护时间（当前${currentHour}点，预期${expectedHour}点），跳过`);
    return new Response(JSON.stringify({
      success: false,
      reason: "not_scheduled_time",
      currentHour,
      expectedHour
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const result = await maintainWebhooks();
  
  return new Response(JSON.stringify(result, null, 2), {
    headers: { 'Content-Type': 'application/json' }
  });
}
