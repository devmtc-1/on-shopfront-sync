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
  // const syncProductsToShopify = async () => {
  //   setSyncing(true);
  //   setSyncResult(null);
  //   setProgress(0);
  //   setErrors([]);
  //   setProducts([]); // Clear previous product list

  //   try {
  //     let cursor = null;
  //     let hasNextPage = true;
  //     const pageSize = 50;
  //     const results = [];
  //     let totalProducts = 0;

  //     while (hasNextPage) {
  //       const params = new URLSearchParams({ first: pageSize });
  //       if (cursor) params.set("after", cursor);

  //       const resp = await fetch(`/shopfront-products?${params.toString()}`);
  //       const data = await resp.json();

  //       if (data.errors?.length) setErrors(prev => [...prev, ...data.errors]);

  //       const productsPage = data.products.map(e => e.node);

  //       // Set total product count on first pagination
  //       if (!totalProducts) {
  //         totalProducts = data.totalCount || productsPage.length;
  //         setTotalCount(totalProducts);
  //       }

  //       // Add products from this page to the list
  //       setProducts(prev => [...prev, ...productsPage]);

  //       // Sync each product
  //       for (let i = 0; i < productsPage.length; i++) {
  //         const product = productsPage[i];
  //         console.log("Syncing product:", product);
  //         console.log("Syncing product:", product.name, product.id);

  //         const importResp = await fetch("/import-products", {
  //           method: "POST",
  //           headers: { "Content-Type": "application/json" },
  //           body: JSON.stringify({ product }),
  //         });

  //         let importData;
  //         const text = await importResp.text();
  //         try { 
  //           importData = JSON.parse(text); 
  //         } catch (err) {
  //           results.push({ productId: product.id, success: false, error: "JSON parsing failed" });
  //           continue;
  //         }

  //         if (importData.success) {
  //           results.push({ productId: product.id, success: true });
  //         } else {
  //           results.push({ 
  //             productId: product.id, 
  //             success: false, 
  //             error: importData.error || "Unknown error" 
  //           });
  //         }

  //         // Update progress after each product sync
  //         const syncedCount = results.length;
  //         const progressValue = totalProducts 
  //           ? Math.round((syncedCount / totalProducts) * 100) 
  //           : 0;
  //         setProgress(progressValue);
  //       }

  //       // Next page
  //       hasNextPage = data.pageInfo?.hasNextPage || false;
  //       cursor = data.pageInfo?.endCursor || null;
  //     }

  //     setSyncResult(results);
  //   } catch (err) {
  //     alert("Sync failed: " + err.message);
  //   } finally {
  //     setSyncing(false);
  //   }
  // };
  
const syncProductsToShopify = async () => {
  setSyncing(true);
  setSyncResult(null);
  setProgress(0);
  setErrors([]);
  setProducts([]);

  try {
    // 1. 启动后台任务
    const startResp = await fetch("/start-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        pageSize: 50,
        categoryId: "11e96ba509ddf5a487c00ab419c1109c" // 可选：如果要按分类同步
      }),
    });

    const startData = await startResp.json();
    if (!startData.success) {
      throw new Error(startData.error || "启动任务失败");
    }

    const taskId = startData.taskId;
    console.log("后台同步任务已启动，ID:", taskId);

    // 2. 开始轮询任务状态
    const pollInterval = setInterval(async () => {
      try {
        const checkResp = await fetch(`/check-sync?taskId=${taskId}`);
        const checkData = await checkResp.json();

        if (!checkData.success) {
          clearInterval(pollInterval);
          setSyncing(false);
          alert("查询任务状态失败: " + checkData.error);
          return;
        }

        // 更新前端状态
        setProgress(checkData.progress);
        setTotalCount(checkData.totalProducts);
        // 可以只更新部分产品用于展示
        if (checkData.products && checkData.products.length > 0) {
          setProducts(checkData.products);
        }

        // 任务完成或失败，停止轮询
        if (checkData.status === 'completed' || checkData.status === 'failed') {
          clearInterval(pollInterval);
          setSyncing(false);
          setSyncResult(checkData.results);
          setProducts(checkData.products || []); // 设置最终产品列表
          
          if (checkData.status === 'failed') {
            alert("同步失败: " + checkData.error);
          } else {
            console.log("同步完成！", checkData);
          }
        }
      } catch (pollError) {
        console.error("轮询失败:", pollError);
      }
    }, 2000); // 每2秒轮询一次

    // 组件卸载或出错时清理定时器
    return () => clearInterval(pollInterval);

  } catch (err) {
    console.error("同步过程出错:", err);
    alert("启动同步过程失败: " + err.message);
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