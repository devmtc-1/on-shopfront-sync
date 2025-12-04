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
  if (!metafields || metafields.length === 0) return;
  
  console.log(`📝 设置 ${metafields.length} 个自定义字段到产品 ${productId}`);
  
  // Shopify API 限制：每个请求最多 25 个 metafields
  const batchSize = 25;
  for (let i = 0; i < metafields.length; i += batchSize) {
    const batch = metafields.slice(i, i + batchSize);
    
    // 使用 POST 方法批量创建/更新 metafields
    for (const metafield of batch) {
      try {
        // 先尝试获取现有的 metafield
        const existingResp = await shopifyRequest(
          `products/${productId}/metafields.json?namespace=${metafield.namespace}&key=${metafield.key}`
        );
        
        if (existingResp.metafields && existingResp.metafields.length > 0) {
          // 更新现有的 metafield
          const existingId = existingResp.metafields[0].id;
          await shopifyRequest(`products/${productId}/metafields/${existingId}.json`, "PUT", {
            metafield: {
              id: existingId,
              value: metafield.value,
              type: metafield.type
            }
          });
          console.log(`  更新 metafield: ${metafield.namespace}.${metafield.key} = ${metafield.value}`);
        } else {
          // 创建新的 metafield
          await shopifyRequest(`products/${productId}/metafields.json`, "POST", {
            metafield: metafield
          });
          console.log(`  创建 metafield: ${metafield.namespace}.${metafield.key} = ${metafield.value}`);
        }
        
        // 每个 metafield 之间添加延迟，避免速率限制
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`❌ 设置 metafield ${metafield.namespace}.${metafield.key} 失败:`, error.message);
        // 继续处理其他 metafields，不中断整个流程
      }
    }
    
    console.log(`✅ 批量处理完成 ${Math.min(i+batchSize, metafields.length)}/${metafields.length}`);
    
    // 批次之间添加更长的延迟
    if (i + batchSize < metafields.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

// ---------------- 处理 Additional Fields ----------------
function processAdditionalFields(additionalFields) {
  if (!additionalFields || !Array.isArray(additionalFields)) return [];
  
  return additionalFields
    .map(field => {
      const value = field.value ? field.value.trim() : '';
      // 过滤掉空值或只有空格的值
      if (value === '' || value === null || value === undefined) {
        return null;
      }
      
      // 将 safeName 转换为 Shopify 格式（空格转下划线）
      // 注意：Shopify 会自动将空格转为下划线，但我们要保持一致
      let shopifyKey = field.safeName.toLowerCase();
      
      // 处理特殊情况：例如 "alcohol by volume" -> "alcohol_by_volume"
      shopifyKey = shopifyKey.replace(/\s+/g, '_');
      
      // 移除特殊字符，只保留字母、数字和下划线
      shopifyKey = shopifyKey.replace(/[^a-z0-9_]/g, '');
      
      // 根据字段类型和内容设置合适的 metafield 类型
      let type = "single_line_text_field";
      let processedValue = value;
      
      // 检查是否是数字字段
      const numericFields = ['weight', 'length', 'width', 'height', 'rating', 'alcoholbyvolume'];
      const isNumericField = numericFields.includes(field.safeName.toLowerCase());
      
      // 尝试解析数字（移除百分号等）
      if (isNumericField) {
        // 移除百分号、单位等，只保留数字
        const numericMatch = value.match(/(\d+(\.\d+)?)/);
        if (numericMatch) {
          processedValue = numericMatch[1];
          type = "number_decimal";
        }
      }
      
      // 对于酒精含量，特殊处理百分号
      if (field.safeName.toLowerCase() === 'alcoholbyvolume') {
        // 如果包含百分号，保存为文本以便显示
        if (value.includes('%')) {
          type = "single_line_text_field";
          processedValue = value;
        }
      }
      
      // 对于尺寸字段，确保是数字
      if (['length', 'width', 'height'].includes(field.safeName.toLowerCase())) {
        const numValue = parseFloat(processedValue);
        if (!isNaN(numValue)) {
          type = "number_decimal";
          processedValue = numValue.toString();
        }
      }
      
      return {
        key: shopifyKey,
        value: processedValue,
        type: type,
        namespace: "custom",
        originalName: field.name,
        originalValue: value
      };
    })
    .filter(field => field !== null); // 过滤掉空值
}

// ---------------- 构建 Shopify Metafields ----------------
function buildShopifyMetafields(additionalFields) {
  const processedFields = processAdditionalFields(additionalFields);
  
  // 输出调试信息
  console.log(`🔍 处理 ${additionalFields?.length || 0} 个附加字段，得到 ${processedFields.length} 个有效字段`);
  
  // 显示处理后的字段信息
  processedFields.forEach(field => {
    console.log(`   ${field.originalName} → custom.${field.key}: "${field.value}" (${field.type})`);
  });
  
  return processedFields.map(field => ({
    namespace: field.namespace,
    key: field.key,
    value: field.value.toString(),
    type: field.type
  }));
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

// ---------------- Build Product Payload ----------------
function buildShopifyProductPayload(product) {
  const sfIdTag = `SFID:${product.id}`;
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
      tags: [sfIdTag],
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
// ---------------- Import Product ----------------
export async function importProductToShopify(product) {
  console.log(`\n🔄 开始同步产品: ${product.name}`);
  console.log(`   ID: ${product.id}`);
  console.log(`   状态: ${product.status}`);
  console.log(`   分类: ${product.category?.name || '无'}`);
  
  try {
    const existing = await findShopifyProductBySFID(product.id);
    
    // 构建自定义字段
    const metafields = product.additionalFields ? buildShopifyMetafields(product.additionalFields) : [];
    
    // 如果有已存在的产品，无论当前状态如何都要处理（更新或归档）
    if (existing) {
      console.log(`🔍 找到现有产品: ${existing.id} - ${existing.title}`);
      
      const updatePayload = {
        product: {
          id: existing.id,
          title: product.name,
          body_html: product.description || "",
          vendor: product.brand?.name || "Unknown",
          product_type: product.category?.name || "",
          tags: [`SFID:${product.id}`],
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
      
      // 更新自定义字段（即使产品被归档也更新）
      if (metafields.length > 0) {
        await setProductMetafields(existing.id, metafields);
      }
      
      if (product.status === "ACTIVE") {
        console.log("🔄 更新活跃产品");
        
        // 更新默认variant的价格、条码和库存管理
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
          }
          
          // 变体更新之间添加延迟
          await new Promise(resolve => setTimeout(resolve, 200));
          await shopifyRequest(`products/${existing.id}/variants/${shopifyVariant.id}.json`, "PUT", variantPayload);
        }
        
        // 同步库存
        await syncInventory(product, shopifyProduct);
        
        // 处理集合 - 只在产品活跃且有关联分类时处理
        if (product.category?.name) {
          try {
            const collection = await getOrCreateCollection(product.category.name);
            await addProductToCollection(shopifyProduct.id, collection.id);
          } catch (collectionError) {
            // 集合错误不中断整个流程，只记录日志
            console.log(`⚠️  集合处理失败: ${collectionError.message}，继续其他操作`);
          }
        }
        
        console.log(`✅ 完成更新: ${product.name}`);
        return { updated: true, archived: false, product: shopifyProduct };
        
      } else {
        console.log("📦 归档非活跃产品");
        return { updated: true, archived: true, product: shopifyProduct };
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
      
      console.log(`✅ 完成创建: ${product.name}`);
      return { updated: false, archived: false, product: shopifyProduct };
    }
  } catch (error) {
    console.error(`❌ 导入产品失败 ${product.name}:`, error.message);
    
    // 如果是"already exists in this collection"错误，忽略它
    if (error.message.includes("already exists in this collection")) {
      console.log(`⚠️  集合重复添加错误，产品其他部分已成功更新`);
      return { 
        updated: true, 
        archived: product.status !== "ACTIVE",
        partial: true,
        error: "集合重复添加",
        product: null 
      };
    }
    
    throw error;
  }
}

// 导出所有需要的函数
export { shopifyRequest };
