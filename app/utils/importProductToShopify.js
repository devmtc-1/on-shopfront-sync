// utils/importProductToShopify.js
import fetch from "node-fetch";

// ============ 添加速率限制器 ============
let lastShopifyRequest = 0;
const MIN_REQUEST_INTERVAL = 600; // 600ms = 每秒最多1.67次请求（留有余量）

async function waitIfNeeded() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastShopifyRequest;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`⏸️  等待 ${waitTime}ms 避免速率限制`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

// ---------------- Shopify API Helper ----------------
async function shopifyRequest(endpoint, method = "GET", body = null) {
  // 等待速率限制
  await waitIfNeeded();
  
  const domain = process.env.SHOPIFY_DOMAIN;
  const token = process.env.SHOPIFY_ACCESS_TOKEN;

  const resp = await fetch(`https://${domain}/admin/api/2025-07/${endpoint}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await resp.text();
  lastShopifyRequest = Date.now(); // 更新最后请求时间
  
  if (!resp.ok) {
    // 如果是速率限制错误，等待更长时间后重试
    if (text.includes("Exceeded") && text.includes("calls per second")) {
      console.log("⚠️  Shopify API速率限制，等待2秒后重试...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      return shopifyRequest(endpoint, method, body); // 重试
    }
    throw new Error(`Shopify API 错误: ${text}`);
  }

  return {
    ...JSON.parse(text),
    headers: resp.headers,
  };
}

// ---------------- 分页查找 Shopify 产品 ----------------
export async function findShopifyProductBySFID(sfId) {
  const tag = encodeURIComponent(`SFID:${sfId}`);
  const pageLimit = 50;
  let url = `products.json?limit=${pageLimit}&tag=${tag}`;

  while (url) {
    const resp = await shopifyRequest(url);
    if (!resp.products?.length) return null;

    const existing = resp.products.find(p =>
      p.tags.split(",").map(t => t.trim()).includes(`SFID:${sfId}`)
    );

    if (existing) return existing;

    const linkHeader = resp.headers?.get?.("link");
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
      url = match ? match[1].replace(`https://${process.env.SHOPIFY_DOMAIN}/admin/api/2025-07/`, "") : null;
    } else {
      url = null;
    }
  }

  return null;
}

// ---------------- Collection Helper ----------------
// ---------------- Collection Helper ----------------
async function getOrCreateCollection(categoryName) {
  const encodedName = encodeURIComponent(categoryName);
  const resp = await shopifyRequest(`custom_collections.json?title=${encodedName}`);
  if (resp.custom_collections?.length > 0) return resp.custom_collections[0];

  const createResp = await shopifyRequest("custom_collections.json", "POST", {
    custom_collection: { title: categoryName },
  });
  return createResp.custom_collection;
}

async function addProductToCollection(productId, collectionId) {
  try {
    // 先检查产品是否已经在集合中
    const collectsResp = await shopifyRequest(`collects.json?collection_id=${collectionId}&product_id=${productId}`);
    
    if (collectsResp.collects && collectsResp.collects.length > 0) {
      console.log(`✅ 产品 ${productId} 已在集合 ${collectionId} 中，跳过添加`);
      return collectsResp.collects[0]; // 返回现有的关联
    }
    
    // 如果不在集合中，则添加
    const resp = await shopifyRequest("collects.json", "POST", {
      collect: { product_id: productId, collection_id: collectionId },
    });
    
    console.log(`✅ 添加产品 ${productId} 到集合 ${collectionId}`);
    return resp.collect;
  } catch (error) {
    // 如果是"already exists"错误，忽略它
    if (error.message.includes("already exists in this collection")) {
      console.log(`✅ 产品 ${productId} 已在集合 ${collectionId} 中（API 返回已存在）`);
      return null;
    }
    
    // 其他错误继续抛出
    console.error(`❌ 添加到集合失败: ${error.message}`);
    throw error;
  }
}

// ---------------- Metafield Helper ----------------
async function setProductMetafields(productId, metafields) {
  if (!metafields || metafields.length === 0) {
    console.log(`⏭️  没有 metafields 需要设置`);
    return { successCount: 0, failCount: 0 };
  }
  
  console.log(`\n📝 开始设置 ${metafields.length} 个自定义字段到产品 ${productId}`);
  
  const results = {
    success: [],
    failed: []
  };
  
  for (let i = 0; i < metafields.length; i++) {
    const metafield = metafields[i];
    
    try {
      console.log(`\n   🔧 处理字段 ${i+1}/${metafields.length}: ${metafield.namespace}.${metafield.key}`);
      
      // 先尝试获取现有的 metafield
      const existingResp = await shopifyRequest(
        `products/${productId}/metafields.json?namespace=${metafield.namespace}&key=${metafield.key}`
      );
      
      let result;
      let action = 'created';
      
      if (existingResp.metafields && existingResp.metafields.length > 0) {
        // 更新现有的 metafield
        const existingId = existingResp.metafields[0].id;
        console.log(`     找到现有 metafield, ID: ${existingId}`);
        
        result = await shopifyRequest(`products/${productId}/metafields/${existingId}.json`, "PUT", {
          metafield: {
            id: existingId,
            value: metafield.value,
            type: metafield.type
          }
        });
        action = 'updated';
      } else {
        // 创建新的 metafield
        console.log(`     创建新 metafield`);
        result = await shopifyRequest(`products/${productId}/metafields.json`, "POST", {
          metafield: metafield
        });
        action = 'created';
      }
      
      console.log(`     ✅ ${action} ${metafield.namespace}.${metafield.key} = "${metafield.value}"`);
      results.success.push({
        key: `${metafield.namespace}.${metafield.key}`,
        value: metafield.value,
        action: action
      });
      
      // 添加延迟避免速率限制
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`     ❌ 失败: ${metafield.namespace}.${metafield.key}`);
      console.error(`        错误: ${error.message}`);
      
      // 检查错误类型
      if (error.message.includes('429') || error.message.includes('Too Many Requests')) {
        console.log(`        ⚠️  速率限制，等待 2 秒...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        // 可以在这里添加重试逻辑
      }
      
      results.failed.push({
        key: `${metafield.namespace}.${metafield.key}`,
        value: metafield.value,
        error: error.message
      });
    }
  }
  
  console.log(`\n📊 Metafields 设置结果:`);
  console.log(`   成功: ${results.success.length} 个`);
  console.log(`   失败: ${results.failed.length} 个`);
  
  if (results.failed.length > 0) {
    console.log(`\n❌ 失败的字段:`);
    results.failed.forEach(fail => {
      console.log(`   - ${fail.key}: ${fail.error}`);
    });
  }
  
  if (results.success.length > 0) {
    console.log(`\n✅ 成功的字段:`);
    results.success.forEach(success => {
      console.log(`   - ${success.key} = "${success.value}" (${success.action})`);
    });
  }
  
  return results;
}

// ---------------- 处理 Additional Fields ----------------
function processAdditionalFields(additionalFields) {
  if (!additionalFields || !Array.isArray(additionalFields)) return [];
  
  console.log(`🔍 原始附加字段数量: ${additionalFields.length}`);
  
  const processed = additionalFields
    .map((field, index) => {
      // 记录原始数据
      console.log(`\n   字段 ${index+1}:`);
      console.log(`     - 名称: "${field.name}"`);
      console.log(`     - safeName: "${field.safeName}"`);
      console.log(`     - 类型: ${field.type}`);
      console.log(`     - 原始值: "${field.value}"`);
      
      const originalValue = field.value || '';
      const trimmedValue = originalValue.trim();
      
      console.log(`     - 修剪后值: "${trimmedValue}"`);
      
      // 检查是否是空值
      const isEmpty = trimmedValue === '' || 
                      trimmedValue === 'null' || 
                      trimmedValue === 'undefined' ||
                      trimmedValue.length === 0;
      
      if (isEmpty) {
        console.log(`     → ❌ 过滤掉: 空值`);
        return null;
      }
      
      // 检查字段名是否有效
      if (!field.name || field.name.trim() === '') {
        console.log(`     → ❌ 过滤掉: name 为空`);
        return null;
      }
      
      // 使用 name 字段创建 Shopify key（不是 safeName！）
      let shopifyKey = field.name.toLowerCase();
      console.log(`     - 原始名称: "${shopifyKey}"`);
      
      // 特殊处理：将空格替换为下划线（Shopify 格式）
      shopifyKey = shopifyKey.replace(/\s+/g, '_');
      
      // 移除特殊字符，只保留字母、数字、下划线
      shopifyKey = shopifyKey.replace(/[^a-z0-9_]/g, '');
      
      // 对于包含多个单词的字段，特殊处理
      if (field.name.includes(' ')) {
        console.log(`     - 多单词字段 "${field.name}" → Shopify key: "${shopifyKey}"`);
      }
      
      // 再次检查转换后的 key
      if (!shopifyKey || shopifyKey.length === 0) {
        console.log(`     → ❌ 过滤掉: 转换后 key 为空`);
        return null;
      }
      
      console.log(`     - 转换后 key: "${shopifyKey}"`);
      
      // 对于 TEXT 类型字段，直接使用文本值
      let processedValue = trimmedValue;
      let type = "single_line_text_field"; // 所有字段都设为文本
      
      // 特殊处理数字相关字段（但仍保持为文本类型）
      const numericFields = ['weight', 'length', 'width', 'height', 'rating'];
      
      // 注意：这里也要使用转换后的 key 来检查
      const isNumericField = numericFields.includes(shopifyKey.toLowerCase());
      
      if (isNumericField) {
        console.log(`     - 检测为数字相关字段`);
        // 尝试提取数字部分
        const numericMatch = trimmedValue.match(/(\d+(\.\d+)?)/);
        if (numericMatch) {
          processedValue = numericMatch[1];
          console.log(`     - 提取数字值: "${processedValue}"`);
        }
      }
      
      // 特殊处理酒精含量字段
      if (field.name.toLowerCase().includes('alcohol') && field.name.toLowerCase().includes('volume')) {
        console.log(`     - 酒精含量字段，保留原始值: "${trimmedValue}"`);
        // 保留原始值（包含百分号）
      }
      
      console.log(`     → ✅ 将创建: custom.${shopifyKey} = "${processedValue}" (${type})`);
      
      return {
        key: shopifyKey,
        value: processedValue,
        type: type,
        namespace: "custom",
        originalName: field.name,
        originalSafeName: field.safeName,
        originalValue: originalValue,
        trimmedValue: trimmedValue,
        isNumericField: isNumericField
      };
    })
    .filter(field => field !== null); // 过滤掉空值
  
  console.log(`\n📊 字段处理统计:`);
  console.log(`   原始字段数: ${additionalFields.length}`);
  console.log(`   处理后有效字段数: ${processed.length}`);
  console.log(`   过滤掉字段数: ${additionalFields.length - processed.length}`);
  
  // 特别显示处理后的字段映射关系
  console.log(`\n🔀 字段映射关系:`);
  processed.forEach(field => {
    console.log(`   "${field.originalName}" → custom.${field.key}`);
  });
  
  return processed;
}

// ---------------- 构建 Shopify Metafields ----------------
function buildShopifyMetafields(additionalFields) {
  const processedFields = processAdditionalFields(additionalFields);
  
  if (processedFields.length === 0) {
    console.log(`⚠️  没有有效的附加字段需要同步`);
    return [];
  }
  
  // 输出处理后的字段信息
  console.log(`📋 要同步的 metafields 列表:`);
  processedFields.forEach(field => {
    console.log(`   ${field.originalName} → custom.${field.key}: "${field.value}" (${field.type})`);
  });
  
  // 创建 Shopify metafields 格式
  const metafields = processedFields.map(field => ({
    namespace: field.namespace,
    key: field.key,
    value: field.value.toString(),
    type: field.type
  }));
  
  console.log(`✅ 构建了 ${metafields.length} 个 metafields`);
  return metafields;
}

// ---------------- Inventory Helper ----------------
async function getShopifyLocations() {
  const resp = await shopifyRequest("locations.json");
  return resp.locations;
}

async function setVariantInventory(variantId, locationId, quantity) {
  return shopifyRequest("inventory_levels/set.json", "POST", {
    location_id: locationId,
    inventory_item_id: variantId,
    available: quantity,
  });
}

// ---------------- 处理重量 ----------------
function extractWeightFromFields(additionalFields) {
  if (!additionalFields || !Array.isArray(additionalFields)) return null;
  
  const weightField = additionalFields.find(f => 
    f.safeName.toLowerCase() === 'weight'
  );
  
  if (!weightField || !weightField.value) return null;
  
  const weightValue = weightField.value.trim();
  
  // 尝试解析数字
  const weightMatch = weightValue.match(/(\d+(\.\d+)?)/);
  if (!weightMatch) return null;
  
  const weightNum = parseFloat(weightMatch[1]);
  if (isNaN(weightNum)) return null;
  
  return {
    value: weightNum,
    unit: 'kg' // 根据你的数据调整单位
  };
}
// ---------------- 处理 Tags ----------------
function processShopfrontTags(tags) {
  if (!tags || !Array.isArray(tags) || tags.length === 0) {
    console.log(`🏷️  无 Shopfront 标签数据`);
    return [];
  }
  
  console.log(`🏷️  处理 ${tags.length} 个 Shopfront 标签:`);
  
  const processedTags = [];
  
  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i];
    
    if (!tag || !tag.name || typeof tag.name !== 'string') {
      console.log(`   ${i+1}. ❌ 无效标签对象`);
      continue;
    }
    
    const tagName = tag.name.trim();
    
    if (!tagName) {
      console.log(`   ${i+1}. ❌ 标签名称为空`);
      continue;
    }
    
    console.log(`   ${i+1}. ✅ "${tagName}"`);
    processedTags.push(tagName);
  }
  
  console.log(`   → 有效标签: ${processedTags.length} 个`);
  return processedTags;
}

// ---------------- 构建 Shopify 标签 ----------------
function buildShopifyTags(product) {
  // 基础标签：SFID（用于产品匹配，必须保留）
  const sfIdTag = `SFID:${product.id}`;
  
  // 处理 Shopfront 标签
  const shopfrontTags = processShopfrontTags(product.tags);
  
  // 组合所有标签：SFID 标签 + Shopfront 标签
  const allTags = [sfIdTag, ...shopfrontTags];
  
  // 去重（确保 SFID 标签在最前面）
  const uniqueTags = [sfIdTag, ...new Set(shopfrontTags)];
  
  console.log(`📌 最终标签 (${uniqueTags.length} 个):`);
  console.log(`   1. ${sfIdTag} ← 匹配标签（始终保留）`);
  shopfrontTags.forEach((tag, index) => {
    console.log(`   ${index + 2}. ${tag}`);
  });
  
  return uniqueTags;
}
// ---------------- 更新 Build Product Payload ----------------
function buildShopifyProductPayload(product) {
  const tags = buildShopifyTags(product);  // 使用新的标签构建函数
  
  const images = [];
  if (product.image) images.push({ src: product.image });
  if (product.alternateImages?.length) product.alternateImages.forEach(img => img && images.push({ src: img }));

  // 获取第一条价格作为产品价格
  const primaryPrice = product.prices?.[0]?.price || 0;
  const primaryBarcode = product.barcodes?.[0]?.code || "";

  // 处理重量
  const weightInfo = extractWeightFromFields(product.additionalFields);

  // 创建产品时包含一个启用了库存管理的变体
  const variant = {
    price: primaryPrice.toFixed(2),
    sku: primaryBarcode,
    barcode: primaryBarcode,
    inventory_management: "shopify",
    inventory_quantity: 0,
    requires_shipping: true,
    inventory_policy: "deny"
  };

  // 如果找到重量，设置到变体
  if (weightInfo) {
    variant.weight = weightInfo.value;
    variant.weight_unit = weightInfo.unit;
    console.log(`⚖️  设置产品重量: ${weightInfo.value} ${weightInfo.unit}`);
  }

  return {
    product: {
      title: product.name,
      body_html: product.description || "",
      vendor: product.brand?.name || "Unknown",
      product_type: product.category?.name || "",
      tags: tags,  // 使用构建的标签数组（包含 SFID）
      images,
      variants: [variant]
    }
  };
}

// ---------------- Sync Inventory ----------------
async function syncInventory(product, shopifyProduct) {
  const locations = await getShopifyLocations();
  
  // 使用Shopify的默认variant
  const shopifyVariant = shopifyProduct.variants?.[0];
  if (!shopifyVariant) {
    console.log("⚠️  未找到Shopify变体，跳过库存同步");
    return;
  }

  const inventoryPerOutlet = product.inventory || [];
  
  for (const outlet of inventoryPerOutlet) {
    const location = locations.find(loc => loc.name.trim() === outlet.outlet.name.trim());
    if (!location) {
      console.log(`⚠️  未找到对应Shopify location: ${outlet.outlet.name}`);
      continue;
    }
    
    try {
      await setVariantInventory(shopifyVariant.inventory_item_id, location.id, outlet.quantity);
      console.log(`✅ 同步库存到 ${outlet.outlet.name}: ${outlet.quantity} 件`);
    } catch (error) {
      console.error(`❌ 库存同步失败 ${outlet.outlet.name}:`, error.message);
    }
  }
}

// ---------------- Import Product ----------------
// ---------------- 在 Import Product 中添加标签调试 ----------------
export async function importProductToShopify(product) {
  console.log(`\n🔄 ======== 开始同步产品: ${product.name} ========`);
  console.log(`   📍 ID: ${product.id}`);
  console.log(`   📊 状态: ${product.status}`);
  console.log(`   🏷️  分类: ${product.category?.name || '无'}`);
  
  // 显示 Shopfront 标签信息
  if (product.tags && Array.isArray(product.tags)) {
    console.log(`\n🏷️  Shopfront 原始标签 (${product.tags.length} 个):`);
    product.tags.forEach((tag, index) => {
      console.log(`   ${index+1}. ${tag.name} (ID: ${tag.id})`);
    });
  } else {
    console.log(`\n🏷️  无 Shopfront 标签数据`);
  }
  
  try {
    const existing = await findShopifyProductBySFID(product.id);
    
    // 构建标签（包含 SFID + Shopfront 标签）
    const tags = buildShopifyTags(product);
    
    // 构建自定义字段
    console.log(`\n🔨 处理自定义字段...`);
    const metafields = product.additionalFields ? buildShopifyMetafields(product.additionalFields) : [];
    
    // 如果有已存在的产品
    if (existing) {
      console.log(`\n🔍 找到现有产品: ${existing.id} - ${existing.title}`);
      
      // 显示现有的 Shopify 标签
      console.log(`\n🏷️  Shopify 现有标签: ${existing.tags || '无'}`);
      
      const updatePayload = {
        product: {
          id: existing.id,
          title: product.name,
          body_html: product.description || "",
          vendor: product.brand?.name || "Unknown",
          product_type: product.category?.name || "",
          tags: tags,  // 更新标签（包含 SFID）
          status: product.status === "ACTIVE" ? "active" : "archived",
        },
      };

      // 如果有图片，添加图片更新
      const images = [];
      if (product.image) images.push({ src: product.image });
      if (product.alternateImages?.length) product.alternateImages.forEach(img => img && images.push({ src: img }));
      if (images.length > 0) {
        updatePayload.product.images = images;
      }

      const resp = await shopifyRequest(`products/${existing.id}.json`, "PUT", updatePayload);
      const shopifyProduct = resp.product;
      
      // 更新自定义字段
      console.log(`\n🔧 更新自定义字段...`);
      const metafieldResult = await setProductMetafields(existing.id, metafields);
      
      if (product.status === "ACTIVE") {
        console.log("\n🔄 更新活跃产品的其他信息...");
        
        // 更新变体信息
        const shopifyVariant = shopifyProduct.variants?.[0];
        if (shopifyVariant) {
          const primaryPrice = product.prices?.[0]?.price || 0;
          const primaryBarcode = product.barcodes?.[0]?.code || "";
          
          // 处理重量
          const weightInfo = extractWeightFromFields(product.additionalFields);
          
          const variantPayload = {
            variant: {
              id: shopifyVariant.id,
              price: primaryPrice.toFixed(2),
              sku: primaryBarcode,
              barcode: primaryBarcode,
              inventory_management: "shopify",
              inventory_quantity: 0,
              requires_shipping: true,
              inventory_policy: "deny"
            },
          };
          
          // 如果找到重量，设置到变体
          if (weightInfo) {
            variantPayload.variant.weight = weightInfo.value;
            variantPayload.variant.weight_unit = weightInfo.unit;
            console.log(`   ⚖️  设置重量: ${weightInfo.value} ${weightInfo.unit}`);
          }
          
          // 变体更新
          await new Promise(resolve => setTimeout(resolve, 200));
          await shopifyRequest(`products/${existing.id}/variants/${shopifyVariant.id}.json`, "PUT", variantPayload);
          console.log(`   💰 更新价格: $${primaryPrice.toFixed(2)}`);
        }
        
        // 同步库存
        console.log(`\n📦 同步库存...`);
        await syncInventory(product, shopifyProduct);
        
        // 处理集合
        if (product.category?.name) {
          console.log(`\n📚 处理集合关联...`);
          try {
            const collection = await getOrCreateCollection(product.category.name);
            await addProductToCollection(shopifyProduct.id, collection.id);
            console.log(`   ✅ 集合处理完成`);
          } catch (collectionError) {
            console.log(`   ⚠️  集合处理失败: ${collectionError.message}`);
          }
        }
        
        console.log(`\n✅ ======== 完成更新: ${product.name} ========`);
        console.log(`   🏷️  标签已更新: ${tags.join(', ')}`);
        
        return { 
          updated: true, 
          archived: false, 
          metafields: metafieldResult,
          product: shopifyProduct 
        };
        
      } else {
        console.log(`\n📦 产品非活跃，仅更新基本信息`);
        console.log(`✅ ======== 完成归档更新: ${product.name} ========`);
        console.log(`   🏷️  标签已更新（归档产品也保留标签）`);
        
        return { 
          updated: true, 
          archived: true, 
          metafields: metafieldResult,
          product: shopifyProduct 
        };
      }
      
    } else {
      // 新产品：只同步ACTIVE状态的产品
      if (product.status !== "ACTIVE") {
        console.log(`⏭️  跳过非活跃新产品 (状态: ${product.status})`);
        return { 
          updated: false, 
          skipped: true,
          reason: `新产品状态为 ${product.status}`,
          product: null 
        };
      }
      
      // 创建新产品（包含启用了库存管理的变体）
      const payload = buildShopifyProductPayload(product);
      const resp = await shopifyRequest("products.json", "POST", payload);
      const shopifyProduct = resp.product;
      
      console.log("🆕 创建新 Shopify 产品:", shopifyProduct.id);
      
      // 设置自定义字段
      if (metafields.length > 0) {
        await setProductMetafields(shopifyProduct.id, metafields);
      }
      
      // 同步库存
      await syncInventory(product, shopifyProduct);
      
      // 处理集合
      if (product.category?.name) {
        try {
          const collection = await getOrCreateCollection(product.category.name);
          await addProductToCollection(shopifyProduct.id, collection.id);
        } catch (collectionError) {
          console.log(`⚠️  集合处理失败: ${collectionError.message}`);
        }
      }
      
      console.log(`\n✅ ======== 完成创建: ${product.name} ========`);
      console.log(`   🏷️  初始标签: ${tags.join(', ')}`);
      
      return { updated: false, archived: false, product: shopifyProduct };
    }
  } catch (error) {
    console.error(`\n❌ ======== 导入产品失败 ${product.name} ========`);
    console.error(`   错误: ${error.message}`);
    throw error;
  }
}

// 导出所有需要的函数
export { shopifyRequest };
