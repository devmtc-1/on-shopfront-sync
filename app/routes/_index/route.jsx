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
  Layout,
  Stack
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
  const [pagesToFetch, setPagesToFetch] = useState("1");
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

  const fetchProductsFromAPI = async () => {
    setLoadingProducts(true);
    setProducts([]);
    setErrors([]);
    setTotalCount(0);
    setProgress(0);

    try {
      const categories = categoriesInput
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
      
      if (categories.length === 0) {
        alert("请输入至少一个分类ID");
        return;
      }

      const params = new URLSearchParams({
        categories: categories.join(','),
        fetchMode
      });

      if (fetchMode === "partial") {
        if (!startingCursor) {
          alert("部分获取模式下需要输入起始cursor");
          return;
        }
        const pages = parseInt(pagesToFetch, 10);
        if (isNaN(pages) || pages < 1 || pages > 100) {
          alert("请输入有效的页数 (1-100)");
          return;
        }
        params.append("startingCursor", startingCursor);
        params.append("pages", pages.toString());
      }

      const resp = await fetch(`/shopfront-products?${params.toString()}`);
      const data = await resp.json();

      if (data.error) {
        alert("获取产品失败: " + data.error);
        return;
      }

      if (data.errors?.length) {
        setErrors(data.errors);
      }

      const fetchedProducts = data.products.map(e => e.node);
      setProducts(fetchedProducts);
      setTotalCount(data.totalCount || fetchedProducts.length);
      setProgress(100);

      alert(`成功获取 ${fetchedProducts.length} 个产品`);
      
    } catch (err) {
      alert("获取产品出错: " + err.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  const syncProductsToShopify = async () => {
    if (products.length === 0) {
      alert("请先获取产品列表");
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    setProgress(0);

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
            continue;
          }

          if (importData.success) {
            results.push({ 
              productId: product.id, 
              productName: product.name,
              success: true 
            });
          } else {
            results.push({ 
              productId: product.id, 
              productName: product.name,
              success: false, 
              error: importData.error || "未知错误" 
            });
          }

        } catch (error) {
          results.push({ 
            productId: product.id, 
            productName: product.name,
            success: false, 
            error: error.message 
          });
        }

        // 更新同步进度
        const syncProgress = Math.round(((i + 1) / products.length) * 100);
        setProgress(syncProgress);
        
        // 每个产品同步后添加延迟
        if (i < products.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      // 统计结果
      const successCount = results.filter(r => r.success).length;
      const failCount = results.filter(r => !r.success).length;
      
      console.log(`📊 同步统计: ${successCount} 成功, ${failCount} 失败`);
      
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

          <Layout>
            <Layout.Section>
              {/* 模式选择 */}
              <div style={{ marginBottom: 16 }}>
                <Stack vertical>
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
                  <TextField
                    label="分类ID (多个用逗号分隔)"
                    value={categoriesInput}
                    onChange={setCategoriesInput}
                    placeholder="例如: 11e96ba509ddf5a487c00ab419c1109c,11e718d3cac71ecaa6100a1468096c0d"
                    helpText="输入要同步的分类ID，多个ID用逗号分隔"
                    disabled={syncing || loadingProducts}
                  />

                  {/* 部分获取模式的额外输入框 */}
                  {fetchMode === "partial" && (
                    <>
                      <TextField
                        label="起始Cursor"
                        value={startingCursor}
                        onChange={setStartingCursor}
                        placeholder="输入起始cursor"
                        helpText="从哪一页开始获取 (可以复制上一次获取的最后cursor)"
                        disabled={syncing || loadingProducts}
                      />
                      <TextField
                        label="获取页数"
                        value={pagesToFetch}
                        onChange={setPagesToFetch}
                        type="number"
                        min="1"
                        max="100"
                        placeholder="例如: 10"
                        helpText="要获取多少页 (每页50个产品)"
                        disabled={syncing || loadingProducts}
                      />
                    </>
                  )}
                </Stack>
              </div>

              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <Button primary onClick={redirectToShopfrontAuth}>
                  Authorize Shopfront
                </Button>
                <Button primary onClick={fetchToken} loading={loadingToken}>
                  Get Token
                </Button>
                <Button primary onClick={fetchProductsFromAPI} loading={loadingProducts}>
                  {fetchMode === "all" ? "获取产品" : `获取${pagesToFetch}页产品`}
                </Button>
                <Button primary onClick={syncProductsToShopify} loading={syncing}>
                  同步到Shopify
                </Button>
              </div>

              {loadingProducts && (
                <div style={{ marginTop: 16 }}>
                  <p>正在获取产品... <Spinner size="small" /></p>
                  {progress > 0 && <ProgressBar progress={progress} size="small" />}
                </div>
              )}

              {totalCount > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p>总共产品: {totalCount}</p>
                  {products.length > 0 && (
                    <p>当前列表: {products.length} 个产品</p>
                  )}
                </div>
              )}

              {syncing && progress > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p>同步进度: {progress}%</p>
                  <ProgressBar progress={progress} size="small" />
                </div>
              )}
            </Layout.Section>
          </Layout>

          {products.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3>产品列表 ({products.length})</h3>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ddd', padding: 8 }}>
                <ul>
                  {products.map(p => (
                    <li key={p.id} style={{ marginBottom: 4 }}>
                      <strong>{p.name}</strong> — {p.id}
                      {p.category && ` (分类: ${p.category.name})`}
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* 显示最后产品的cursor，方便下次使用 */}
              {products.length > 0 && fetchMode === "all" && (
                <div style={{ marginTop: 16, padding: 8, backgroundColor: '#f5f5f5', borderRadius: 4 }}>
                  <p style={{ margin: 0, fontSize: '0.9em', color: '#666' }}>
                    最后cursor: <code style={{ 
                      display: 'block', 
                      marginTop: 4, 
                      padding: 4, 
                      backgroundColor: '#fff', 
                      borderRadius: 3,
                      wordBreak: 'break-all',
                      fontSize: '0.8em'
                    }}>
                      {products[products.length - 1]?.cursor || "未获取cursor"}
                    </code>
                  </p>
                </div>
              )}
            </div>
          )}

          {errors.length > 0 && (
            <div style={{ marginTop: 16, color: "red" }}>
              <h3>GraphQL 错误 ({errors.length})</h3>
              <ul>
                {errors.map((e, idx) => (
                  <li key={idx}>{e.message || JSON.stringify(e)}</li>
                ))}
              </ul>
            </div>
          )}

          {syncResult && (
            <div style={{ marginTop: 16 }}>
              <h3>同步结果</h3>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #ddd', padding: 8 }}>
                <ul>
                  {syncResult.map(r => (
                    <li key={r.productId} style={{ marginBottom: 4 }}>
                      {r.productName}: {r.success ? 
                        <span style={{ color: 'green' }}>✅ 成功</span> : 
                        <span style={{ color: 'red' }}>❌ 失败 ({r.error})</span>
                      }
                    </li>
                  ))}
                </ul>
              </div>
              <div style={{ marginTop: 8 }}>
                <strong>统计:</strong> 
                成功: {syncResult.filter(r => r.success).length} / 
                失败: {syncResult.filter(r => !r.success).length}
              </div>
            </div>
          )}
        </TextContainer>
      </Card>
    </Page>
  );
}
