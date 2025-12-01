import express from "express";
import { createRequestHandler } from "@react-router/express";

const app = express();

// 健康检查
app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    app: "On Shopfront Sync",
    time: new Date().toISOString()
  });
});

// 静态文件
app.use(express.static("public"));

// 核心：加载并运行你的React Router应用
let requestHandler;
try {
  // 导入构建后的应用
  const build = await import("./build/index.js");
  console.log("✅ React Router应用加载成功");
  requestHandler = createRequestHandler({ build });
} catch (error) {
  console.error("❌ 加载失败:", error.message);
  
  // 开发环境友好提示
  app.all("*", (req, res) => {
    res.send(`
      <div style="padding: 20px; font-family: sans-serif;">
        <h1>🚧 应用未构建</h1>
        <p>请先运行构建命令：</p>
        <pre style="background: #f0f0f0; padding: 10px;">npm run build</pre>
        <p>或者开发模式：</p>
        <pre style="background: #f0f0f0; padding: 10px;">npm run dev</pre>
        <p><small>错误：${error.message}</small></p>
      </div>
    `);
  });
}

// 应用所有路由到React Router
if (requestHandler) {
  app.all("*", requestHandler);
}

// 启动服务器
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("=== Shopify App 已启动 ===");
  console.log(`✅ 访问：http://localhost:${port}`);
  console.log(`✅ 健康检查：http://localhost:${port}/health`);
});