// app/routes/_index/route.jsx
import React, { useState } from "react";
import { 
  Page, 
  Card, 
  Button, 
  TextContainer, 
  ProgressBar, 
  Spinner,
  TextField
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

  // Paginate and sync products per page with real-time progress
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
    setProducts([]); // Clear previous product list

    try {
      let cursor = null;
      let hasNextPage = true;
      const pageSize = 50;
      const results = [];
      let totalProducts = 0;

      while (hasNextPage) {
        const params = new URLSearchParams({ 
          first: pageSize,
          // 添加分类ID参数
          categories: categories.join(',')
        });
        if (cursor) params.set("after", cursor);

        const resp = await fetch(`/shopfront-products?${params.toString()}`);
        const data = await resp.json();

        if (data.errors?.length) setErrors(prev => [...prev, ...data.errors]);

        const productsPage = data.products.map(e => e.node);

        // Set total product count on first pagination
        if (!totalProducts) {
          totalProducts = data.totalCount || productsPage.length;
          setTotalCount(totalProducts);
        }

        // Add products from this page to the list
        setProducts(prev => [...prev, ...productsPage]);

        // Sync each product
        for (let i = 0; i < productsPage.length; i++) {
          const product = productsPage[i];
          console.log("Syncing product:", product);
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
            results.push({ productId: product.id, success: false, error: "JSON parsing failed" });
            continue;
          }

          if (importData.success) {
            results.push({ productId: product.id, success: true });
          } else {
            results.push({ 
              productId: product.id, 
              success: false, 
              error: importData.error || "Unknown error" 
            });
          }

          // Update progress after each product sync
          const syncedCount = results.length;
          const progressValue = totalProducts 
            ? Math.round((syncedCount / totalProducts) * 100) 
            : 0;
          setProgress(progressValue);
        }

        // Next page
        hasNextPage = data.pageInfo?.hasNextPage || false;
        cursor = data.pageInfo?.endCursor || null;
      }

      setSyncResult(results);
    } catch (err) {
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

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <Button primary onClick={redirectToShopfrontAuth}>
              Authorize Shopfront
            </Button>
            <Button primary onClick={fetchToken} loading={loadingToken}>
              Get Token
            </Button>
            <Button primary onClick={syncProductsToShopify} loading={syncing}>
              Sync to Shopify
            </Button>
          </div>

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
        </TextContainer>
      </Card>
    </Page>
  );
}
