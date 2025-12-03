// app/routes/start-sync.jsx
import { json } from "@remix-run/node";
import { getTokens } from "../utils/shopfrontTokens.server";

// 用于存储任务状态（生产环境请替换为数据库）
const syncTasks = new Map();

export async function action({ request }) {
  const vendor = "plonk";
  const tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ success: false, error: "未授权" }, { status: 401 });
  }

  const { pageSize = 50, categoryId } = await request.json();
  const taskId = `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // 初始化任务状态
  syncTasks.set(taskId, {
    status: 'running', // running, completed, failed
    progress: 0,
    totalProducts: 0,
    importedCount: 0,
    results: [],
    products: [],
    error: null,
    createdAt: new Date().toISOString(),
  });

  // ⚡ 关键：异步执行同步任务，不阻塞本次响应
  setTimeout(() => {
    executeSyncTask(taskId, tokens.access_token, vendor, pageSize, categoryId)
      .catch(error => {
        const task = syncTasks.get(taskId);
        if (task) {
          task.status = 'failed';
          task.error = error.message;
        }
      });
  }, 0);

  // 立即返回任务ID
  return json({
    success: true,
    taskId,
    message: "后台同步任务已开始"
  });
}

// 后台同步主逻辑（基于你之前的循环逻辑）
async function executeSyncTask(taskId, accessToken, vendor, pageSize, categoryId) {
  const task = syncTasks.get(taskId);
  if (!task) return;

  try {
    let cursor = null;
    let hasNextPage = true;
    let page = 0;

    while (hasNextPage) {
      page++;
      // 1. 调用你现有的 /shopfront-products 接口获取一页数据
      // （你需要调整该接口，使其能接收categoryId参数并返回产品列表）
      const products = await fetchProductsPage(accessToken, vendor, pageSize, cursor, categoryId);

      // 2. 批量导入产品（优化方案，替换逐条导入）
      const batchResult = await importProductsBatch(products);
      task.results.push(...batchResult);
      task.importedCount += batchResult.filter(r => r.success).length;
      task.products.push(...products);

      // 3. 更新进度
      if (task.totalProducts === 0 && products.totalCount) {
        task.totalProducts = products.totalCount;
      }
      task.progress = task.totalProducts > 0 
        ? Math.round((task.importedCount / task.totalProducts) * 100) 
        : 0;
      
      // 4. 准备下一页
      hasNextPage = products.hasNextPage;
      cursor = products.nextCursor;

      // 5. 模拟延迟，避免API限制
      if (hasNextPage) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // 同步完成
    task.status = 'completed';
    task.progress = 100;

  } catch (error) {
    task.status = 'failed';
    task.error = error.message;
    console.error(`Task ${taskId} failed:`, error);
  }
}

// 辅助函数：获取单页产品（需要你根据现有逻辑实现）
async function fetchProductsPage(accessToken, vendor, first, after, categoryId) {
  // 这里集成你原来的分页查询逻辑，添加categoryId过滤
  // 返回格式：{ products: [...], totalCount: X, hasNextPage: Boolean, nextCursor: String }
}