// app/routes/test-category-query.jsx
import { json } from "@remix-run/node";
import fetch from "node-fetch";
import { getTokens } from "../utils/shopfrontTokens.server";

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function loader() {
  const vendor = "plonk";
  let tokens = getTokens(vendor);

  if (!tokens?.access_token) {
    return json({ error: "请先授权再测试" }, { status: 401 });
  }

  const CATEGORY_ID = "11e96ba509ddf5a487c00ab419c1109c";
  
  console.log(`🔍 测试分类 ${CATEGORY_ID}`);
  console.log(`🔧 Token长度: ${tokens.access_token.length}`);

  const tests = [];

  try {
    // 测试1: 验证分类是否存在
    console.log("\n📋 测试1: 验证分类是否存在...");
    
    const categoryQuery = `
      {
        category(id: "${CATEGORY_ID}") {
          id
          name
          description
          productsCount
          children { edges { node { id name } } }
          parent { id name }
        }
      }
    `;

    const categoryResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: categoryQuery }),
    });

    const categoryText = await categoryResp.text();
    const categoryData = JSON.parse(categoryText);
    
    tests.push({
      name: "验证分类",
      success: !categoryData.errors && categoryData.data?.category,
      data: categoryData.data?.category || null,
      errors: categoryData.errors || null
    });

    if (categoryData.errors) {
      console.error("❌ 分类查询错误:", categoryData.errors);
    } else if (categoryData.data?.category) {
      const category = categoryData.data.category;
      console.log(`✅ 分类存在: ${category.name}`);
      console.log(`📊 产品数量: ${category.productsCount || 0}`);
      console.log(`🔗 父分类: ${category.parent?.name || '无'}`);
      console.log(`👶 子分类: ${category.children?.edges?.length || 0} 个`);
    }

    await delay(1000);

    // 测试2: 查询该分类的所有产品（不带状态过滤）
    console.log("\n📋 测试2: 查询该分类的所有产品（不带状态过滤）...");
    
    const productsNoFilterQuery = `
      {
        products(first: 5, categories: ["${CATEGORY_ID}"]) {
          edges {
            node {
              id
              name
              status
              category { id name }
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

    const productsNoFilterResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: productsNoFilterQuery }),
    });

    const productsNoFilterText = await productsNoFilterResp.text();
    const productsNoFilterData = JSON.parse(productsNoFilterText);
    
    tests.push({
      name: "查询分类产品（无状态过滤）",
      success: !productsNoFilterData.errors,
      data: {
        totalCount: productsNoFilterData.data?.products?.totalCount || 0,
        edges: productsNoFilterData.data?.products?.edges || [],
        hasNextPage: productsNoFilterData.data?.products?.pageInfo?.hasNextPage || false
      },
      errors: productsNoFilterData.errors || null
    });

    if (productsNoFilterData.errors) {
      console.error("❌ 产品查询错误:", productsNoFilterData.errors);
    } else {
      const products = productsNoFilterData.data?.products;
      console.log(`✅ 查询成功`);
      console.log(`📊 总产品数: ${products?.totalCount || 0}`);
      
      if (products?.edges && products.edges.length > 0) {
        console.log(`📋 前${products.edges.length}个产品:`);
        products.edges.forEach((edge, index) => {
          console.log(`  ${index + 1}. ${edge.node.name} (状态: ${edge.node.status})`);
        });
      } else {
        console.log(`ℹ️ 该分类下无产品`);
      }
    }

    await delay(1000);

    // 测试3: 查询该分类的ACTIVE产品
    console.log("\n📋 测试3: 查询该分类的ACTIVE产品...");
    
    const productsActiveQuery = `
      {
        products(first: 5, categories: ["${CATEGORY_ID}"], statuses: [ACTIVE]) {
          edges {
            node {
              id
              name
              status
              category { id name }
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

    const productsActiveResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: productsActiveQuery }),
    });

    const productsActiveText = await productsActiveResp.text();
    const productsActiveData = JSON.parse(productsActiveText);
    
    tests.push({
      name: "查询分类ACTIVE产品",
      success: !productsActiveData.errors,
      data: {
        totalCount: productsActiveData.data?.products?.totalCount || 0,
        edges: productsActiveData.data?.products?.edges || [],
        hasNextPage: productsActiveData.data?.products?.pageInfo?.hasNextPage || false
      },
      errors: productsActiveData.errors || null
    });

    if (productsActiveData.errors) {
      console.error("❌ ACTIVE产品查询错误:", productsActiveData.errors);
    } else {
      const products = productsActiveData.data?.products;
      console.log(`✅ 查询成功`);
      console.log(`📊 ACTIVE产品数: ${products?.totalCount || 0}`);
      
      if (products?.edges && products.edges.length > 0) {
        console.log(`📋 前${products.edges.length}个ACTIVE产品:`);
        products.edges.forEach((edge, index) => {
          console.log(`  ${index + 1}. ${edge.node.name}`);
        });
      } else {
        console.log(`ℹ️ 该分类下无ACTIVE产品`);
      }
    }

    await delay(1000);

    // 测试4: 查询所有状态的产品
    console.log("\n📋 测试4: 查询该分类的所有状态产品...");
    
    const productsAllStatusQuery = `
      {
        products(first: 5, categories: ["${CATEGORY_ID}"], statuses: [ACTIVE, DRAFT, ARCHIVED]) {
          edges {
            node {
              id
              name
              status
              category { id name }
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

    const productsAllStatusResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: productsAllStatusQuery }),
    });

    const productsAllStatusText = await productsAllStatusResp.text();
    const productsAllStatusData = JSON.parse(productsAllStatusText);
    
    tests.push({
      name: "查询分类所有状态产品",
      success: !productsAllStatusData.errors,
      data: {
        totalCount: productsAllStatusData.data?.products?.totalCount || 0,
        edges: productsAllStatusData.data?.products?.edges || [],
        hasNextPage: productsAllStatusData.data?.products?.pageInfo?.hasNextPage || false
      },
      errors: productsAllStatusData.errors || null
    });

    if (productsAllStatusData.errors) {
      console.error("❌ 所有状态产品查询错误:", productsAllStatusData.errors);
    } else {
      const products = productsAllStatusData.data?.products;
      console.log(`✅ 查询成功`);
      console.log(`📊 所有状态产品数: ${products?.totalCount || 0}`);
      
      if (products?.edges && products.edges.length > 0) {
        console.log(`📋 前${products.edges.length}个产品（所有状态）:`);
        products.edges.forEach((edge, index) => {
          console.log(`  ${index + 1}. ${edge.node.name} (${edge.node.status})`);
        });
      } else {
        console.log(`ℹ️ 该分类下无任何状态的产品`);
      }
    }

    // 测试5: 不使用categories参数，看看是否有产品
    console.log("\n📋 测试5: 查询所有ACTIVE产品（不限制分类）...");
    
    const allProductsQuery = `
      {
        products(first: 5, statuses: [ACTIVE]) {
          edges {
            node {
              id
              name
              status
              category { id name }
            }
          }
          totalCount
        }
      }
    `;

    const allProductsResp = await fetch(`https://${vendor}.onshopfront.com/api/v2/graphql`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: allProductsQuery }),
    });

    const allProductsText = await allProductsResp.text();
    const allProductsData = JSON.parse(allProductsText);
    
    tests.push({
      name: "查询所有ACTIVE产品",
      success: !allProductsData.errors,
      data: {
        totalCount: allProductsData.data?.products?.totalCount || 0,
        edges: allProductsData.data?.products?.edges || []
      },
      errors: allProductsData.errors || null
    });

    if (allProductsData.errors) {
      console.error("❌ 所有产品查询错误:", allProductsData.errors);
    } else {
      const products = allProductsData.data?.products;
      console.log(`✅ 查询成功`);
      console.log(`📊 全站ACTIVE产品总数: ${products?.totalCount || 0}`);
      
      if (products?.edges && products.edges.length > 0) {
        console.log(`📋 示例产品:`);
        products.edges.forEach((edge, index) => {
          const categoryName = edge.node.category?.name || '无分类';
          console.log(`  ${index + 1}. ${edge.node.name} (分类: ${categoryName})`);
        });
      }
    }

  } catch (error) {
    console.error("❌ 测试过程出错:", error.message);
    tests.push({
      name: "测试过程",
      success: false,
      error: error.message
    });
  }

  console.log("\n🎯 测试结果汇总:");
  console.log("=" .repeat(50));
  
  const successfulTests = tests.filter(t => t.success).length;
  console.log(`✅ 成功测试: ${successfulTests}/${tests.length}`);
  
  tests.forEach((test, index) => {
    console.log(`\n${index + 1}. ${test.name}: ${test.success ? '✅' : '❌'}`);
    if (test.error) {
      console.log(`   错误: ${test.error}`);
    }
    if (test.errors) {
      console.log(`   GraphQL错误: ${JSON.stringify(test.errors)}`);
    }
    if (test.data) {
      if (test.name.includes("分类")) {
        console.log(`   分类信息: ${JSON.stringify(test.data, null, 2)}`);
      } else if (test.name.includes("产品")) {
        console.log(`   产品总数: ${test.data.totalCount || 0}`);
        if (test.data.edges && test.data.edges.length > 0) {
          console.log(`   示例产品:`);
          test.data.edges.forEach((edge, i) => {
            console.log(`     ${i + 1}. ${edge.node.name} (${edge.node.status})`);
          });
        }
      }
    }
  });

  return json({
    ok: true,
    message: "分类查询测试完成",
    categoryId: CATEGORY_ID,
    tests,
    summary: {
      totalTests: tests.length,
      successfulTests: tests.filter(t => t.success).length,
      failedTests: tests.filter(t => !t.success).length
    },
    analysis: {
      possibleIssues: [
        "分类ID可能不正确",
        "产品可能不属于这个分类，而是属于子分类",
        "API可能对categories参数有特殊要求",
        "可能需要使用不同的查询方式"
      ],
      nextSteps: [
        "检查分类ID是否正确",
        "查看分类是否有子分类",
        "尝试查询子分类的产品",
        "检查产品的实际分类关系"
      ]
    }
  });
}
