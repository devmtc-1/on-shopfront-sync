// server.js
import express from "express";
import { createRequestHandler } from "@react-router/express";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
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
app.use(express.static(join(__dirname, "public")));
app.use("/assets", express.static(join(__dirname, "build/client")));

// 加载构建文件 - 修复路径！
let requestHandler;
try {
  console.log("🔍 加载构建文件: ./build/server/index.js");
  
  // ✅ 正确的路径
  const build = await import("./build/server/index.js");
  console.log("✅ 构建文件加载成功");
  
  requestHandler = createRequestHandler({ build });
  
} catch (error) {
  console.error("❌ 加载失败:", error.message);
  
  // 简单回退
  app.all("*", (req, res) => {
    res.send(`
      <div style="padding: 20px;">
        <h1>应用启动错误</h1>
        <p>${error.message}</p>
        <p>构建路径应该是: ./build/server/index.js</p>
      </div>
    `);
  });
}

if (requestHandler) {
  app.all("*", requestHandler);
}

const port = process.env.PORT || 3000;
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log("=== Shopify App 启动 ===");
  console.log(`✅ 服务器运行在: http://${host}:${port}`);
  console.log(`📦 构建目录: ${__dirname}/build`);
});