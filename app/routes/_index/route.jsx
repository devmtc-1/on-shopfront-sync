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
  Box,
  Badge
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
  
  // 新添加的状态
  const [categoriesInput, setCategoriesInput] = useState("");
  const [categories, setCategories] = useState([]);
  const [inputError, setInputError] = useState("");

  const vendor = "plonk";

  // 解析分类ID输入
  const parseCategories = () => {
    setInputError("");
    
    if (!categoriesInput.trim()) {
      setInputError("请输入至少一个分类ID");
      return false;
    }

    // 用逗号分隔，清除空格和空值
    const parsed = categoriesInput
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (parsed.length === 0) {
      setInputError("请输入有效的分类ID");
      return false;
    }

    // 验证ID格式（假设Shopfront ID是32位十六进制）
    const isValid = parsed.every(id => /^[0-9a-f]{32}$/.test(id));
    if (!isValid) {
      setInputError("分类ID格式不正确，应为32位十六进制字符");
      return false;
    }

    setCategories(parsed);
    return true;
  };

  // 添加分类ID
  const handleAddCategories = () => {
    if (parseCategories()) {
      // 清空输入框
      setCategoriesInput("");
    }
  };

  // 移除单个分类ID
  const handleRemoveCategory = (index) => {
    setCategories(prev => prev.filter((_, i) => i !== index));
  };

  // 清空所有分类ID
  const handleClearCategories = () => {
    setCategories([]);
    setCategoriesInput("");
    setInputError("");
  };

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

  // 更新同步函数，传入分类ID
  const syncProductsToShopify = async () => {
    if (categories.length === 0) {
      setInputError("请先添加至少一个分类ID");
      return;
    }

    setSyncing(true);
    setSyncResult(null);
    setProgress(0);
    setErrors([]);
    setProducts([]); // 清除之前的商品列表

    try {
      let cursor = null;
      let hasNextPage = true;
      const pageSize = 50;
      const results = [];
      let totalProducts = 0;

      while (hasNextPage) {
        const params = new URLSearchParams({ 
          first: pageSize,
          // 传递分类ID参数
          categories: categories.join(',')
        });
        if (cursor) params.set("after", cursor);

        const resp = await fetch(`/shopfront-products?${params.toString()}`);
        const data = await resp.json();

        if (data.errors?.length) setErrors(prev => [...prev, ...data.errors]);

        const productsPage = data.products.map(e => e.node);

        // 第一次分页时设置总商品数
        if (!totalProducts) {
          totalProducts = data.totalCount || productsPage.length;
          setTotalCount(totalProducts);
        }

        // 添加当前页的商品到列表
        setProducts(prev => [...prev, ...productsPage]);

        // 同步每个商品
        for (let i = 0; i < productsPage.length; i++) {
          const product = productsPage[i];
          console.log("Syncing product:", product.name, product.id);

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
            results.push({ productId: product.id, success: false, error: "JSON解析失败" });
            continue;
          }

          if (importData.success) {
            results.push({ productId: product.id, success: true });
          } else {
            results.push({ 
              productId: product.id, 
              success: false, 
              error: importData.error || "未知错误" 
            });
          }

          // 更新同步进度
          const syncedCount = results.length;
          const progressValue = totalProducts 
            ? Math.round((syncedCount / totalProducts) * 100) 
            : 0;
          setProgress(progressValue);
        }

        // 获取下一页
        hasNextPage = data.pageInfo?.hasNextPage || false;
        cursor = data.pageInfo?.endCursor || null;
      }

      setSyncResult(results);
    } catch (err) {
      alert("同步失败: " + err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Page title="产品同步">
      <Card sectioned>
        <TextContainer>
          <p>✅ 应用已成功启动！</p>

          {/* 授权和获取Token按钮 */}
          <div style={{ display: "flex", gap: 8, marginTop: 12, marginBottom: 16 }}>
            <Button primary onClick={redirectToShopfrontAuth}>
              授权 Shopfront
            </Button>
            <Button primary onClick={fetchToken} loading={loadingToken}>
              获取 Token
            </Button>
          </div>

          {/* 分类ID输入区域 */}
          <Layout>
            <Layout.Section>
              <Card sectioned>
                <TextContainer>
                  <h3>分类ID设置</h3>
                  <p>输入要同步的分类ID（多个ID用逗号分隔）</p>
                  
                  <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="分类ID"
                        labelHidden
                        value={categoriesInput}
                        onChange={setCategoriesInput}
                        placeholder="例如: 11e96ba509ddf5a487c00ab419c1109c, 11e718d3cac71ecaa6100a1468096c0d"
                        error={inputError}
                        disabled={syncing}
                      />
                    </div>
                    <Button onClick={handleAddCategories} disabled={syncing}>
                      添加
                    </Button>
                    <Button 
                      onClick={handleClearCategories} 
                      disabled={syncing || categories.length === 0}
                    >
                      清空
                    </Button>
                  </div>

                  {/* 已添加的分类ID展示 */}
                  {categories.length > 0 && (
                    <div style={{ marginTop: 12 }}>
                      <p><strong>已选择的分类 ({categories.length}):</strong></p>
                      <Box padding="200">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                          {categories.map((categoryId, index) => (
                            <Badge
                              key={index}
                              status="info"
                              onRemove={() => handleRemoveCategory(index)}
                              disabled={syncing}
                            >
                              {categoryId.substring(0, 8)}...
                            </Badge>
                          ))}
                        </div>
                      </Box>
                    </div>
                  )}

                  {/* 提示信息 */}
                  <div style={{ marginTop: 12 }}>
                    <Banner status="info">
                      <p>
                        <strong>提示：</strong>分类ID可以在Shopfront后台的URL中找到。
                        例如：https://plonk.onshopfront.com/admin/categories/11e96ba509ddf5a487c00ab419c1109c/edit
                      </p>
                    </Banner>
                  </div>
                </TextContainer>
              </Card>
            </Layout.Section>

            {/* 同步按钮和进度 */}
            <Layout.Section>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button 
                  primary 
                  onClick={syncProductsToShopify} 
                  loading={syncing}
                  disabled={categories.length === 0 || !token}
                >
                  同步到 Shopify
                </Button>
                
                {categories.length === 0 && (
                  <Banner status="warning">
                    请先添加至少一个分类ID
                  </Banner>
                )}
              </div>

              {loadingProducts && <p>加载商品中... <Spinner size="small" /></p>}
              {totalCount > 0 && <p>总商品数: {totalCount}</p>}
              {progress > 0 && (
                <div style={{ marginTop: 12 }}>
                  <ProgressBar progress={progress} size="small" />
                  <p style={{ textAlign: "center", marginTop: 4 }}>{progress}%</p>
                </div>
              )}
            </Layout.Section>
          </Layout>

          {/* 商品列表 */}
          {products.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h3>商品列表 ({products.length})</h3>
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
              <h3>同步结果</h3>
              <Box maxHeight="300px" overflow="auto" padding="200" background="bg-subdued">
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {syncResult.map(r => (
                    <li key={r.productId} style={{ padding: "8px 0", borderBottom: "1px solid #ddd" }}>
                      <span style={{ marginRight: 8 }}>
                        {r.success ? "✅" : "❌"}
                      </span>
                      {r.productId}: {r.success ? "成功" : `失败 (${r.error})`}
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
