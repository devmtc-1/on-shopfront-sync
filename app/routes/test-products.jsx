// app/routes/test-categories.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

export async function loader() {
  const vendor = "plonk";
  const tokens = getTokens(vendor);
  
  if (!tokens?.access_token) {
    return json({ error: "请先完成授权" }, { status: 401 });
  }

  console.log("🔍 开始获取所有分类...");

  try {
    // 一次性获取所有分类（使用大的first值）
    const query = `
      {
        categories(first: 500) {
          edges {
            node {
              id
              name
              description
              parent { id name }
              children { id name }
              productsCount
              createdAt
              updatedAt
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
          totalCount
        }
      }
    `;

    const response = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    
    if (data.errors) {
      console.error("GraphQL错误:", data.errors);
      return json({ 
        error: "GraphQL错误", 
        details: data.errors 
      }, { status: 500 });
    }

    const edges = data.data?.categories?.edges || [];
    const categories = edges.map(edge => edge.node);
    const totalCount = data.data?.categories?.totalCount || 0;
    const hasNextPage = data.data?.categories?.pageInfo?.hasNextPage || false;

    console.log(`✅ 获取到 ${categories.length} 个分类，总计 ${totalCount}`);
    
    // 显示分类信息
    categories.forEach(category => {
      console.log(`📦 ${category.name} (ID: ${category.id}) - ${category.productsCount || 0} 个产品`);
    });

    return json({
      ok: true,
      totalCount,
      hasNextPage,
      categories,
      message: `成功获取 ${categories.length} 个分类`
    });

  } catch (error) {
    console.error("获取分类失败:", error);
    return json({ 
      error: "获取分类失败: " + error.message 
    }, { status: 500 });
  }
}

// 简单的React组件显示分类
export default function TestCategories() {
  const data = useLoaderData();
  
  if (data.error) {
    return (
      <div style={{ padding: '20px', fontFamily: 'monospace' }}>
        <h1>❌ 错误</h1>
        <p>{data.error}</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>📋 分类列表</h1>
      <p>总计: {data.totalCount} 个分类</p>
      
      <div style={{ marginTop: '20px' }}>
        {data.categories.map(category => (
          <div key={category.id} style={{ 
            marginBottom: '15px', 
            padding: '10px', 
            border: '1px solid #ddd',
            borderRadius: '5px'
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '16px' }}>
              {category.name}
            </div>
            <div style={{ color: '#666', fontSize: '14px' }}>
              ID: <code>{category.id}</code>
            </div>
            <div style={{ color: '#666', fontSize: '14px' }}>
              产品数量: {category.productsCount || 0}
            </div>
            {category.description && (
              <div style={{ color: '#888', fontSize: '12px', marginTop: '5px' }}>
                描述: {category.description}
              </div>
            )}
            {category.parent && (
              <div style={{ color: '#888', fontSize: '12px' }}>
                父分类: {category.parent.name} (ID: {category.parent.id})
              </div>
            )}
            {category.children && category.children.length > 0 && (
              <div style={{ color: '#888', fontSize: '12px' }}>
                子分类: {category.children.length} 个
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
