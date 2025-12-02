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
  List,
  Layout,
  LegacyCard
} from "@shopify/polaris";

export default function IndexRoute() {
  const [token, setToken] = useState(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [products, setProducts] = useState([]);
  const [errors, setErrors] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [pageSettings, setPageSettings] = useState({
    startPage: 1,
    endPage: 4,
    pageSize: 50
  });
  const [pageInfo, setPageInfo] = useState({
    totalPages: 0,
    currentPage: 0
  });

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

  // 获取产品总数和总页数
  const fetchProductStats = async () => {
    try {
      const resp = await fetch(`/shopfront-products?first=1`);
      const data = await resp.json();
      if (data.ok && data.totalCount) {
        const total = data.totalCount;
        setTotalCount(total);
        
        const totalPages = Math.ceil(total / pageSettings.pageSize);
        setPageInfo(prev => ({ ...prev, totalPages }));
        
        return { total, totalPages };
      }
    } catch (err) {
      console.error("获取产品统计失败:", err);
    }
    return { total: 0, totalPages: 0 };
  };

  // 获取指定页的产品
  const fetchProductsByPage = async (pageNumber) => {
    try {
      // 计算游标位置（简化版，实际需要根据游标）
      // 这里我们使用一个简单的实现：获取所有页直到目标页
      let allProducts = [];
      let hasNextPage = true;
      let cursor = null;
      let currentPage = 1;
      
      while (hasNextPage && currentPage <= pageNumber) {
        const params = new URLSearchParams({ first: pageSettings.pageSize });
        if (cursor) params.set("after", cursor);
        
        const resp = await fetch(`/shopfront-products?${params.toString()}`);
        const data = await resp.json();
        
        if (!data.ok) {
          throw new Error(data.error || "获取产品失败");
        }
        
        if (currentPage === pageNumber) {
          return data.products.map(e => e.node);
        }
        
        hasNextPage = data.pageInfo?.hasNextPage || false;
        cursor = data.pageInfo?.endCursor || null;
        currentPage++;
        
        // 页面间延迟
        if (hasNextPage) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      return [];
      
    } catch (err) {
      console.error(`获取第 ${pageNumber} 页产品失败:`, err);
      throw err;
    }
  };

  // 获取多页产品（使用批量API）
  const fetchMultiplePages = async (startPage, endPage) => {
    try {
      const totalPagesToFetch = endPage - startPage + 1;
      console.log(`📚 获取第 ${startPage} 到 ${endPage} 页，共 ${totalPagesToFetch} 页`);
      
      // 首先获取起始页之前的总产品数，计算游标位置
      // 简化实现：直接使用批量API获取所有需要的页
      const params = new URLSearchParams({
        first: pageSettings.pageSize,
        pages: totalPagesToFetch,
        batch: "true"
      });
      
      const resp = await fetch(`/shopfront-products?${params.toString()}`);
      const data = await resp.json();
      
      if (!data.ok) {
        throw new Error(data.error || "批量获取产品失败");
      }
      
      return data.products.map(e => e.node);
      
    } catch (err) {
      console.error("获取多页产品失败:", err);
      throw err;
    }
  };

  // 同步单个产品
  const syncSingleProduct = async (product) => {
    try {
      const importResp = await fetch("/import-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });

      const importData = await importResp.json();

      return {
        productId: product.id,
        productName: product.name,
        success: importData.success,
        error: importData.error,
        shopifyProduct: importData.shopifyResp?.product
      };
    } catch (error) {
      return {
        productId: product.id,
        productName: product.name,
        success: false,
        error: error.message
      };
    }
  };

  // 主同步函数 - 按页同步
  const syncProductsByPages = async () => {
    if (!pageSettings.startPage || !pageSettings.endPage) {
      alert("请输入起始页和结束页");
      return;
    }
    
    if (pageSettings.startPage > pageSettings.endPage) {
      alert("起始页不能大于结束页");
      return;
    }
    
    setSyncing(true);
    setSyncResult(null);
    setProgress(0);
    setErrors([]);
    setProducts([]);

    try {
      // 获取产品统计信息
      const stats = await fetchProductStats();
      if (stats.totalPages === 0) {
        throw new Error("无法获取产品信息，请先授权");
      }
      
      // 验证页码范围
      if (pageSettings.endPage > stats.totalPages) {
        alert(`结束页不能超过总页数 ${stats.totalPages}`);
        setSyncing(false);
        return;
      }
      
      const startPage = parseInt(pageSettings.startPage);
      const endPage = parseInt(pageSettings.endPage);
      const totalPagesToSync = endPage - startPage + 1;
      
      console.log(`🔄 开始同步第 ${startPage} 到 ${endPage} 页，共 ${totalPagesToSync} 页`);
      
      // 获取所有需要同步的产品
      const productsToSync = await fetchMultiplePages(startPage, endPage);
      console.log(`✅ 获取到 ${productsToSync.length} 个产品需要同步`);
      
      if (productsToSync.length === 0) {
        alert("没有找到需要同步的产品");
        setSyncing(false);
        return;
      }
      
      // 开始同步每个产品
      const results = [];
      for (let i = 0; i < productsToSync.length; i++) {
        const product = productsToSync[i];
        
        // 更新当前页信息
        const currentPage = startPage + Math.floor(i / pageSettings.pageSize);
        setPageInfo(prev => ({ ...prev, currentPage }));
        
        console.log(`🔄 同步产品 ${i + 1}/${productsToSync.length} (第 ${currentPage} 页): ${product.name}`);
        
        const result = await syncSingleProduct(product);
        results.push(result);
        
        // 更新进度
        const currentProgress = Math.round(((i + 1) / productsToSync.length) * 100);
        setProgress(currentProgress);
        
        // 产品间延迟，避免速率限制
        if (i < productsToSync.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 600));
        }
      }
      
      // 更新最终结果
      setProducts(productsToSync);
      setSyncResult(results);
      
      // 统计结果
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      console.log(`✅ 同步完成: 成功 ${successful} 个, 失败 ${failed} 个`);
      
      alert(`同步完成!\n\n` +
            `页数: 第 ${startPage} 页 到 第 ${endPage} 页\n` +
            `产品数: ${productsToSync.length} 个\n` +
            `成功: ${successful} 个\n` +
            `失败: ${failed} 个`);
      
    } catch (err) {
      console.error("同步失败:", err);
      alert("同步失败: " + err.message);
    } finally {
      setSyncing(false);
      setProgress(100);
    }
  };

  const handlePageSettingChange = (field, value) => {
    setPageSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <Page title="分页产品同步">
      <Layout>
        <Layout.Section>
          <LegacyCard title="Onshopfront 授权" sectioned>
            <TextContainer>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <Button primary onClick={redirectToShopfrontAuth}>
                  授权 Onshopfront
                </Button>
                <Button onClick={fetchToken} loading={loadingToken}>
                  获取 Token
                </Button>
              </div>
              
              {token && (
                <Banner status="success">
                  <p>✅ 已获取 Onshopfront 访问令牌</p>
                </Banner>
              )}
            </TextContainer>
          </LegacyCard>
        </Layout.Section>

        <Layout.Section>
          <LegacyCard title="分页同步设置" sectioned>
            <TextContainer>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                <TextField
                  label="起始页"
                  type="number"
                  value={pageSettings.startPage.toString()}
                  onChange={(value) => handlePageSettingChange("startPage", parseInt(value) || 1)}
                  disabled={syncing}
                  min={1}
                  autoComplete="off"
                />
                
                <TextField
                  label="结束页"
                  type="number"
                  value={pageSettings.endPage.toString()}
                  onChange={(value) => handlePageSettingChange("endPage", parseInt(value) || 1)}
                  disabled={syncing}
                  min={pageSettings.startPage}
                  autoComplete="off"
                />
              </div>
              
              <TextField
                label="每页产品数"
                type="number"
                value={pageSettings.pageSize.toString()}
                onChange={(value) => handlePageSettingChange("pageSize", parseInt(value) || 50)}
                disabled={syncing}
                min={1}
                max={100}
                helpText="建议保持50，这是API的最大值"
                autoComplete="off"
              />
              
              <div style={{ marginTop: 16 }}>
                <Button 
                  primary 
                  onClick={syncProductsByPages} 
                  loading={syncing}
                  disabled={!token || syncing}
                  fullWidth
                >
                  {syncing ? "同步中..." : "开始分页同步"}
                </Button>
              </div>
              
              {totalCount > 0 && (
                <div style={{ marginTop: 16, padding: 12, background: "#f9fafb", borderRadius: 8 }}>
                  <p style={{ margin: 0 }}>
                    <strong>产品总数:</strong> {totalCount} 个产品
                    {pageInfo.totalPages > 0 && (
                      <span> · 共 <strong>{pageInfo.totalPages}</strong> 页</span>
                    )}
                  </p>
                </div>
              )}
            </TextContainer>
          </LegacyCard>
        </Layout.Section>

        {syncing && (
          <Layout.Section>
            <LegacyCard title="同步进度" sectioned>
              <TextContainer>
                <div style={{ marginBottom: 16 }}>
                  <ProgressBar progress={progress} size="medium" />
                  <div style={{ 
                    display: "flex", 
                    justifyContent: "space-between",
                    marginTop: 8,
                    fontSize: "14px",
                    color: "#6d7175"
                  }}>
                    <span>进度: {progress}%</span>
                    {pageInfo.currentPage > 0 && (
                      <span>当前页: {pageInfo.currentPage}</span>
                    )}
                  </div>
                </div>
                
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Spinner size="small" />
                  <span>正在同步产品，请勿关闭页面...</span>
                </div>
              </TextContainer>
            </LegacyCard>
          </Layout.Section>
        )}

        {products.length > 0 && !syncing && (
          <Layout.Section>
            <LegacyCard title="已同步产品" sectioned>
              <TextContainer>
                <p><strong>共同步 {products.length} 个产品:</strong></p>
                <List type="bullet">
                  {products.slice(0, 10).map(p => (
                    <List.Item key={p.id}>{p.name}</List.Item>
                  ))}
                  {products.length > 10 && (
                    <List.Item>... 以及 {products.length - 10} 个其他产品</List.Item>
                  )}
                </List>
              </TextContainer>
            </LegacyCard>
          </Layout.Section>
        )}

        {syncResult && !syncing && (
          <Layout.Section>
            <LegacyCard title="同步结果" sectioned>
              <TextContainer>
                <Banner 
                  status={syncResult.every(r => r.success) ? "success" : "warning"} 
                  title="同步完成"
                >
                  <p>
                    页数范围: 第 {pageSettings.startPage} 页 到 第 {pageSettings.endPage} 页<br />
                    处理产品: {syncResult.length} 个<br />
                    成功: <strong>{syncResult.filter(r => r.success).length}</strong> 个<br />
                    失败: <strong>{syncResult.filter(r => !r.success).length}</strong> 个
                  </p>
                </Banner>
                
                {syncResult.filter(r => !r.success).length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <h3>失败的产品 ({syncResult.filter(r => !r.success).length} 个):</h3>
                    <List type="bullet">
                      {syncResult.filter(r => !r.success).slice(0, 5).map((r, idx) => (
                        <List.Item key={idx}>
                          <strong>{r.productName || r.productId}</strong>: {r.error}
                        </List.Item>
                      ))}
                    </List>
                    {syncResult.filter(r => !r.success).length > 5 && (
                      <p>... 以及 {syncResult.filter(r => !r.success).length - 5} 个其他失败产品</p>
                    )}
                  </div>
                )}
              </TextContainer>
            </LegacyCard>
          </Layout.Section>
        )}
      </Layout>
    </Page>
  );
}
