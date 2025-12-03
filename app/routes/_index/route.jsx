// app/routes/_index/route.jsx
import React, { useState } from "react";
import { 
  Page, 
  Card, 
  Button, 
  TextContainer, 
  ProgressBar, 
  Spinner,
  TextField,
  Banner,
  Layout,
  Box
} from "@shopify/polaris";

export default function IndexRoute() {
  const [token, setToken] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [products, setProducts] = useState([]);
  const [errors, setErrors] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  
  // 添加分类ID输入状态
  const [categoriesInput, setCategoriesInput] = useState("");

  const vendor = "plonk";

  const redirectToShopfrontAuth = () => {
    window.location.href = `/shopfront-redirector?vendor=${vendor}`;
  };

  const fetchToken = async () => {
    setLoadingToken(true);
    try {
      const resp = await fetch(`/shopfront-token?vendor=${vendor}`);
      if (!resp.ok) throw new Error(await resp.text());
      const data = await resp.json();
      setToken(data.access_token);
    } catch (err) {
      alert("Error fetching token: " + err.message);
    } finally {
      setLoadingToken(false);
    }
  };

  // 新的同步逻辑：先获取所有产品，再批量同步
  const syncProductsToShopify = async () => {
    // 验证分类ID输入
    const categories = categoriesInput
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
    
    if (categories.length === 0) {
      alert("请输入至少一个分类ID");
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    setProgress(0);
    setErrors([]);
    setProducts([]); // 清除之前的商品列表
    setProgressMessage("开始获取产品...");

    try {
      let cursor = null;
      let hasNextPage = true;
      const pageSize = 50;
      const allProducts = []; // 存储所有产品
      let totalProducts = 0;
      let pageCount = 0;

      // 第一阶段：获取所有产品
      console.log("📥 第一阶段：开始获取所有产品...");
      
      while (hasNextPage) {
        pageCount++;
        const params = new URLSearchParams({ 
          first: pageSize,
          categories: categories.join(',')
        });
        if (cursor) params.set("after", cursor);

        setProgressMessage(`正在获取第 ${pageCount} 页产品...`);
        console.log(`📄 获取第 ${pageCount} 页产品`);
        
        const resp = await fetch(`/shopfront-products?${params.toString()}`);
        const data = await resp.json();

        if (data.errors?.length) {
          setErrors(prev => [...prev, ...data.errors]);
          console.error("获取产品时出错:", data.errors);
        }

        const productsPage = data.products.map(e => e.node);
        allProducts.push(...productsPage);

        // 设置总产品数
        if (!totalProducts && data.totalCount) {
          totalProducts = data.totalCount;
          setTotalCount(totalProducts);
          console.log(`📊 总产品数: ${totalProducts}`);
        }

        console.log(`✅ 获取 ${productsPage.length} 个产品，累计: ${allProducts.length}`);
        
        // 更新获取阶段的进度（占总进度的50%）
        const fetchProgress = totalProducts 
          ? Math.round((allProducts.length / totalProducts) * 50) 
          : 0;
        setProgress(fetchProgress);

        // 下一页
        hasNextPage = data.pageInfo?.hasNextPage || false;
        cursor = data.pageInfo?.endCursor || null;

        // 添加延迟避免速率限制
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      console.log(`🎉 产品获取完成，共 ${allProducts.length} 个产品`);
      
      // 将所有产品设置到state中
      setProducts(allProducts);
      setProgressMessage(`已获取所有 ${allProducts.length} 个产品，开始同步...`);

      // 第二阶段：同步所有产品
      console.log("🔄 第二阶段：开始同步产品...");
      const results = [];
      
      for (let i = 0; i < allProducts.length; i++) {
        const product = allProducts[i];
        setProgressMessage(`正在同步产品 ${i + 1}/${allProducts.length}: ${product.name.substring(0, 30)}...`);

        console.log(`📦 同步产品 ${i + 1}/${allProducts.length}: ${product.name}`);

        try {
          const importResp = await fetch("/import-products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ product }),
          });

          let importData;
          const text = await importResp.text();
          try { 
            importData = JSON.parse(text); 
          } catch (err) {
            results.push({ 
              productId: product.id, 
              productName: product.name,
              success: false, 
              error: "JSON解析失败" 
            });
            console.error(`❌ 产品 ${product.name} 同步失败: JSON解析失败`);
            continue;
          }

          if (importData.success) {
            results.push({ 
              productId: product.id, 
              productName: product.name,
              success: true 
            });
            console.log(`✅ 产品 ${product.name} 同步成功`);
          } else {
            results.push({ 
              productId: product.id, 
              productName: product.name,
              success: false, 
              error: importData.error || "未知错误" 
            });
            console.error(`❌ 产品 ${product.name} 同步失败:`, importData.error);
          }

        } catch (error) {
          results.push({ 
            productId: product.id, 
            productName: product.name,
            success: false, 
            error: error.message 
          });
          console.error(`❌ 产品 ${product.name} 请求失败:`, error.message);
        }

        // 更新同步进度（占总进度的50%-100%）
        const syncProgress = 50 + Math.round(((i + 1) / allProducts.length) * 50);
        setProgress(syncProgress);
        
        // 每个产品同步后添加延迟
        if (i < allProducts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300)); // 300ms延迟避免速率限制
        }
      }

      console.log("🎉 同步完成!");
      
      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      console.log(`📊 同步统计: ${successCount} 成功, ${failCount} 失败`);
      
      if (failCount > 0) {
        console.log("❌ 失败的产品:");
        results.filter(r => !r.success).forEach(r => {
          console.log(`  - ${r.productName}: ${r.error}`);
        });
      }

      setSyncResult(results);
      setProgress(100);
      setProgressMessage(`同步完成！成功: ${successCount}, 失败: ${failCount}`);

    } catch (err) {
      console.error("同步过程出错:", err);
      alert("Sync failed: " + err.message);
      setProgressMessage("同步过程中出现错误");
    } finally {
      setSyncing(false);
    }
  };

  // 统计同步结果
  const successCount = syncResult ? syncResult.filter(r => r.success).length : 0;
  const failCount = syncResult ? syncResult.filter(r => !r.success).length : 0;
  
  return (
    <Page title="Product Sync">
      <Card sectioned>
        <TextContainer>
          <p>✅ Application started successfully!</p>

          {/* 添加分类ID输入框 */}
          <div style={{ marginTop: 16, marginBottom: 16 }}>
            <TextField
              label="分类ID (多个用逗号分隔)"
              value={categoriesInput}
              onChange={setCategoriesInput}
              placeholder="例如: 11e96ba509ddf5a487c00ab419c1109c,11e718d3cac71ecaa6100a1468096c0d"
              helpText="输入要同步的分类ID，多个ID用逗号分隔"
              disabled={syncing}
            />
          </div>

          {/* 按钮区域 */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button primary onClick={redirectToShopfrontAuth} disabled={syncing}>
              Authorize Shopfront
            </Button>
            <Button primary onClick={fetchToken} loading={loadingToken} disabled={syncing}>
              Get Token
            </Button>
            <Button primary onClick={syncProductsToShopify} loading={syncing} disabled={!token}>
              Sync to Shopify
            </Button>
          </div>

          {/* 进度信息 */}
          {progressMessage && (
            <Layout.Section>
              <Box padding="400">
                <Banner status="info">
                  <p>{progressMessage}</p>
                </Banner>
              </Box>
            </Layout.Section>
          )}

          {/* 进度条 */}
          {progress > 0 && (
            <div style={{ marginTop: 16 }}>
              <ProgressBar progress={progress} size="medium" />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                <span>{progress}%</span>
                <span>{totalCount > 0 ? `共 ${totalCount} 个产品` : ''}</span>
              </div>
            </div>
          )}

          {/* 产品列表 */}
          {products.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3>产品列表 ({products.length})</h3>
              <Box maxHeight="300px" overflow="auto" padding="200" background="bg-subdued">
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {products.map(p => (
                    <li key={p.id} style={{ padding: "8px 0", borderBottom: "1px solid #ddd" }}>
                      <strong>{p.name}</strong> — {p.id}<br/>
                      <small>分类: {p.category?.name || "未知"}</small>
                    </li>
                  ))}
                </ul>
              </Box>
            </div>
          )}

          {/* 错误信息 */}
          {errors.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <Banner status="critical">
                <h3>GraphQL 错误 ({errors.length})</h3>
                <Box maxHeight="200px" overflow="auto" padding="200">
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {errors.map((e, idx) => (
                      <li key={idx} style={{ marginBottom: 8 }}>
                        {e.message || JSON.stringify(e)}
                      </li>
                    ))}
                  </ul>
                </Box>
              </Banner>
            </div>
          )}

          {/* 同步结果 */}
          {syncResult && (
            <div style={{ marginTop: 24 }}>
              <h3>同步结果 (成功: {successCount}, 失败: {failCount})</h3>
              <Box maxHeight="400px" overflow="auto" padding="200" background="bg-subdued">
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {syncResult.map((r, index) => (
                    <li key={r.productId} style={{ 
                      padding: "8px 0", 
                      borderBottom: "1px solid #ddd",
                      backgroundColor: r.success ? '#f0f9ff' : '#fef2f2'
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span>{r.success ? "✅" : "❌"}</span>
                        <div style={{ flex: 1 }}>
                          <div>
                            <strong>{index + 1}. {r.productName || r.productId}</strong>
                          </div>
                          {!r.success && (
                            <div style={{ color: "#dc2626", fontSize: "0.875rem", marginTop: 2 }}>
                              错误: {r.error}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Box>
            </div>
          )}
        </TextContainer>
      </Card>
    </Page>
  );
}
