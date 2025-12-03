// app/routes/_index/route.jsx
import React, { useState } from "react";
import { Page, Card, Button, TextContainer, ProgressBar, Spinner } from "@shopify/polaris";

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
  setSyncing(true);
  setSyncResult(null);
  setProgress(0);
  setErrors([]);
  setProducts([]); // Clear previous product list

  try {
    let cursor = null;
    let hasNextPage = true;
    const pageSize = 50;
    const allProducts = []; // 存储所有产品
    let totalProducts = 0;

    // 第一阶段：获取所有产品
    console.log("📥 第一阶段：开始获取所有产品...");
    
    while (hasNextPage) {
      const params = new URLSearchParams({ first: pageSize });
      if (cursor) params.set("after", cursor);

      console.log(`📄 获取产品页面，cursor: ${cursor ? cursor.substring(0, 20) + '...' : '第一页'}`);
      
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
      
      // 更新进度（获取阶段的进度）
      const fetchProgress = totalProducts 
        ? Math.round((allProducts.length / totalProducts) * 100) 
        : 0;
      setProgress(fetchProgress);

      // 下一页
      hasNextPage = data.pageInfo?.hasNextPage || false;
      cursor = data.pageInfo?.endCursor || null;

      // 添加延迟避免速率限制
      if (hasNextPage) {
        console.log("⏳ 等待2秒后获取下一页...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`🎉 产品获取完成，共 ${allProducts.length} 个产品`);
    
    // 将所有产品设置到state中
    setProducts(allProducts);

    // 第二阶段：同步所有产品
    console.log("🔄 第二阶段：开始同步产品...");
    const results = [];
    
    for (let i = 0; i < allProducts.length; i++) {
      const product = allProducts[i];
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

      // 更新同步进度
      const syncProgress = Math.round(((i + 1) / allProducts.length) * 100);
      setProgress(syncProgress);
      
      // 每个产品同步后添加延迟
      if (i < allProducts.length - 1) {
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

