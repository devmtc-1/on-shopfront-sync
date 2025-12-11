// app/routes/cron.maintain-webhooks.jsx
import { maintainWebhooks } from "../utils/webhookMaintenance.server";

export async function loader({ request }) {
  console.log("🛠️ Cron触发: Webhook维护任务");
  
  // 可选：只在凌晨3点运行
  const currentHour = new Date().getHours();
  const expectedHour = 3;
  
  if (currentHour !== expectedHour && !new URL(request.url).searchParams.has("force")) {
    console.log(`⏰ 非维护时间（当前${currentHour}点），跳过`);
    return new Response(JSON.stringify({
      success: false,
      reason: "not_scheduled_time",
      currentHour,
      expectedHour,
      tip: "添加 ?force 参数可强制运行"
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const result = await maintainWebhooks();
  
  return new Response(JSON.stringify(result, null, 2), {
    status: result.success ? 200 : 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
