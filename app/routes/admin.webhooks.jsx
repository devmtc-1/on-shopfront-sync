// app/routes/admin.webhooks.jsx
import { json } from "@remix-run/node";
import { registerShopfrontWebhooks } from "../utils/shopfrontWebhooks.server";

export async function action({ request }) {
  const formData = await request.formData();
  const action = formData.get("action");
  
  if (action === "register") {
    try {
      const webhookUrl = "https://on-shopfront-sync.vercel.app/webhooks/shopfront";
      await registerShopfrontWebhooks(webhookUrl);
      return json({ success: true, message: "Webhook注册成功！" });
    } catch (error) {
      return json({ success: false, message: error.message }, { status: 500 });
    }
  }
  
  return json({ success: false, message: "未知操作" }, { status: 400 });
}

export default function AdminWebhooks() {
  return (
    <div style={{ padding: "20px" }}>
      <h1>Webhook 管理</h1>
      <p>
        <strong>公网URL:</strong> servers-citizens-mines-region.trycloudflare.com
      </p>
      <form method="post">
        <button type="submit" name="action" value="register">
          注册 Onshopfront Webhooks
        </button>
      </form>
    </div>
  );
}
