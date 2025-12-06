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
  Layout
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
  
  // 分类ID输入状态
  const [categoriesInput, setCategoriesInput] = useState("");
  
  // 新增加的输入框状态
  const [startingCursor, setStartingCursor] = useState("");
  const [pagesToFetch, setPagesToFetch] = useState("5");
  const [fetchMode, setFetchMode] = useState("all"); // "all" 或 "partial"

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

  // 新增的函数：获取产品列表（不进行同步）
  const fetchProductsFromAPI = async () => {
    setLoadingProducts(true);
    setProducts([]);
    setErrors([]);
    setTotalCount(0);
    setProgress(0);
    setSyncResult(null);

    try {
      const categories = categoriesInput
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
      
      if (categories.length === 0) {
        alert("请输入至少一个分类ID");
        setLoadingProducts(false);
        return;
      }

      const params = new URLSearchParams({
        categories: categories.join(','),
        fetchMode
      });

      if (fetchMode === "partial") {
        const pages = parseInt(pagesToFetch, 10);
        if (isNaN(pages) || pages < 1 || pages > 100) {
          alert("请输入有效的页数 (1-100)");
          setLoadingProducts(false);
          return;
        }
        params.append("pages", pages.toString());
        
        // 只有在有cursor时才传startingCursor参数
        if (startingCursor.trim()) {
          params.append("startingCursor", startingCursor.trim());
        }
      }

      console.log(`📥 请求参数: ${params.toString()}`);
      
      const resp = await fetch(`/shopfront-products?${params.toString()}`);
      const data = await resp.json();

      if (data.error) {
        alert("获取产品失败: " + data.error);
        setLoadingProducts(false);
        return;
      }

      if (data.errors?.length) {
        setErrors(data.errors);
      }

      const fetchedProducts = data.products.map(e => e.node);
      setProducts(fetchedProducts);
      setTotalCount(data.totalCount || fetchedProducts.length);
      setProgress(100);

      console.log(`🎉 成功获取 ${fetchedProducts.length} 个产品`);
      if (data.lastCursor) {
        console.log(`📌 最后一页cursor: ${data.lastCursor}`);
      }
      
      alert(`成功获取 ${fetchedProducts.length} 个产品`);
      
    } catch (err) {
      alert("获取产品出错: " + err.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  // 保留原来的同步函数（恢复原来的console.log和提示）
  const syncProductsToShopify = async () => {
    if (products.length === 0) {
      alert("请先获取产品列表");
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    setProgress(0);
    setErrors([]);

    try {
      const results = [];
      
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        console.log(`📦 同步产品 ${i + 1}/${products.length}: ${product.name}`);

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

        // 更新同步进度
        const syncProgress = Math.round(((i + 1) / products.length) * 100);
        setProgress(syncProgress);
        
        // 每个产品同步后添加延迟
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500)); // 500ms延迟
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

    } catch (err) {
      console.error("同步过程出错:", err);
      alert("Sync failed: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Page title="Product Sync">
      <Card sectioned>
        <TextContainer>
          <p>✅ Application started successfully!</p>

          {/* 新增的输入区域 */}
          <Layout>
            <Layout.Section>
              {/* 模式选择 */}
              <div style={{ marginBottom: 16 }}>
                <div>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                    获取模式:
                  </label>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        checked={fetchMode === "all"}
                        onChange={() => setFetchMode("all")}
                        disabled={syncing || loadingProducts}
                      />
                      获取全部分类产品
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        checked={fetchMode === "partial"}
                        onChange={() => setFetchMode("partial")}
                        disabled={syncing || loadingProducts}
                      />
                      部分获取 (指定cursor)
                    </label>
                  </div>
                </div>

                {/* 分类ID输入框 */}
                <div style={{ marginTop: 16 }}>
                  <TextField
                    label="分类ID (多个用逗号分隔)"
                    value={categoriesInput}
                    onChange={setCategoriesInput}
                    placeholder="例如: 11e96ba509ddf5a487c00ab419c1109c,11e718d3cac71ecaa6100a1468096c0d"
                    helpText="输入要同步的分类ID，多个ID用逗号分隔"
                    disabled={syncing || loadingProducts}
                  />
                </div>

                {/* 部分获取模式的额外输入框 */}
                {fetchMode === "partial" && (
                  <>
                    <div style={{ marginTop: 16 }}>
                      <TextField
                        label="起始Cursor (选填，不填则从第一页开始)"
                        value={startingCursor}
                        onChange={setStartingCursor}
                        placeholder="输入起始cursor，留空则从第一页开始"
                        helpText="从哪一页开始获取，留空则从第一页开始"
                        disabled={syncing || loadingProducts}
                      />
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <TextField
                        label="获取页数"
                        value={pagesToFetch}
                        onChange={(value) => {
                          // 只允许数字，并且限制在1-100之间
                          const num = parseInt(value, 10);
                          if (isNaN(num)) {
                            setPagesToFetch("");
                          } else if (num < 1) {
                            setPagesToFetch("1");
                          } else if (num > 100) {
                            setPagesToFetch("100");
                          } else {
                            setPagesToFetch(value);
                          }
                        }}
                        type="text" // 使用text类型避免上下箭头
                        placeholder="例如: 5"
                        helpText="要获取多少页 (每页50个产品，范围: 1-100)"
                        disabled={syncing || loadingProducts}
                      />
                    </div>
                  </>
                )}
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Button primary onClick={redirectToShopfrontAuth}>
                  Authorize Shopfront
                </Button>
                <Button primary onClick={fetchToken} loading={loadingToken}>
                  Get Token
                </Button>
                {/* 新增的获取产品按钮 */}
                <Button primary onClick={fetchProductsFromAPI} loading={loadingProducts}>
                  {fetchMode === "all" ? "获取产品" : `获取${pagesToFetch || 'N'}页产品`}
                </Button>
                {/* 原来的同步按钮 */}
                <Button primary onClick={syncProductsToShopify} loading={syncing}>
                  Sync to Shopify
                </Button>
              </div>

              {/* 原有的显示区域 */}
              {loadingProducts && <p>Loading products... <Spinner size="small" /></p>}
              {totalCount > 0 && <p>Total products: {totalCount}</p>}
              {progress > 0 && <ProgressBar progress={progress} size="small" />}

              {products.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h3>Product List ({products.length})</h3>
                  <ul>
                    {products.map(p => (
                      <li key={p.id}>{p.name} — {p.id}</li>
                    ))}
                  </ul>
                </div>
              )}

              {errors.length > 0 && (
                <div style={{ marginTop: 16, color: "red" }}>
                  <h3>GraphQL Errors ({errors.length})</h3>
                  <ul>
                    {errors.map((e, idx) => (
                      <li key={idx}>{e.message || JSON.stringify(e)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {syncResult && (
                <div style={{ marginTop: 16 }}>
                  <h3>Sync Results</h3>
                  <ul>
                    {syncResult.map(r => (
                      <li key={r.productId}>
                        {r.productId}: {r.success ? "✅ Success" : `❌ Failed (${r.error})`}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Layout.Section>
          </Layout>
        </TextContainer>
      </Card>
    </Page>
  );
}
