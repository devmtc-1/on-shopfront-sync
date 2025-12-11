// app/routes/cron.maintain-webhooks.jsx
import { maintainWebhooks } from "../utils/webhookMaintenance.server";

export async function loader({ request }) {
  console.log("🛠️ Cron触发: Webhook维护任务", new Date().toISOString());
  
  // 1. 安全性验证（使用CRON_SECRET）
  const authHeader = request.headers.get('Authorization');
  const expectedSecret = process.env.CRON_SECRET;
  
  if (expectedSecret && authHeader !== `Bearer ${expectedSecret}`) {
    console.error("❌ 未授权访问Cron端点");
    return new Response('Unauthorized', { 
      status: 401,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
  
  // 2. 可选：时间限制（只在凌晨3点运行）
  const currentHour = new Date().getHours();
  const expectedHour = 3; // 凌晨3点
  
  if (currentHour !== expectedHour && !new URL(request.url).searchParams.has("force")) {
    console.log(`⏰ 非维护时间（当前${currentHour}点），跳过`);
    return new Response(JSON.stringify({
      success: false,
      reason: "not_scheduled_time",
      currentHour,
      expectedHour,
      tip: "添加 ?force=true 参数可强制运行"
    }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  try {
    // 3. 执行维护任务
    console.log("🔧 开始执行Webhook维护...");
    const result = await maintainWebhooks();
    
    console.log("✅ 维护任务完成:", result);
    
    return new Response(JSON.stringify(result, null, 2), {
      status: result.success ? 200 : 500,
      headers: { 
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
    
  } catch (error) {
    console.error("❌ 维护任务异常:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// 可选：添加GET和POST方法支持
export async function action({ request }) {
  return loader({ request });
}
