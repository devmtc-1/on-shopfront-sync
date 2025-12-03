// app/routes/check-sync.jsx
import { json } from "@remix-run/node";

// 沿用同一个Map（生产环境需替换为数据库查询）
const syncTasks = new Map(); // 注意：需与 start-sync.jsx 中的是同一个存储

export async function loader({ request }) {
  const url = new URL(request.url);
  const taskId = url.searchParams.get("taskId");

  if (!taskId) {
    return json({ success: false, error: "缺少taskId参数" }, { status: 400 });
  }

  const task = syncTasks.get(taskId);

  if (!task) {
    return json({ success: false, error: "任务不存在或已过期" }, { status: 404 });
  }

  return json({
    success: true,
    status: task.status,
    progress: task.progress,
    totalProducts: task.totalProducts,
    importedCount: task.importedCount,
    results: task.results.slice(-20), // 返回最近20条结果
    products: task.products.slice(0, 50), // 返回前50个产品用于预览
    error: task.error,
    createdAt: task.createdAt,
  });
}