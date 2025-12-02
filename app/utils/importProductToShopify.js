// utils/importProductToShopify.js
import fetch from "node-fetch";

// ---------------- Shopify API Helper ----------------
async function shopifyRequest(endpoint, method = "GET", body = null) {
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
  if (!resp.ok) throw new Error(`Shopify API 错误: ${text}`);

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
  return shopifyRequest("collects.json", "POST", {
    collect: { product_id: productId, collection_id: collectionId },
  });
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

// ---------------- Build Product Payload ----------------
function buildShopifyProductPayload(product) {
  const sfIdTag = `SFID:${product.id}`;
  const images = [];
  if (product.image) images.push({ src: product.image });
  if (product.alternateImages?.length) product.alternateImages.forEach(img => img && images.push({ src: img }));

  // 安全的 prices 处理
  const prices = Array.isArray(product.prices) ? product.prices : [];
  const variants = prices.map(p => {
    const barcode = product.barcodes?.[0]?.code || "";
    const quantity = p.quantity;
    return {
      price: p.price.toFixed(2),
      sku: barcode,
      barcode,
      option1: quantity === 1 ? "Single" : `${quantity} Pack`,
      inventory_management: "shopify",
      inventory_quantity: 0,
    };
  });

  return {
    product: {
      title: product.name,
      body_html: product.description || "",
      vendor: product.brand?.name || "Unknown",
      product_type: product.category?.name || "",
      tags: [sfIdTag],
      // 移除 status 字段，因为只有ACTIVE产品会进入这个函数
      images,
      options: [{ name: "Packaging", values: variants.map(v => v.option1) }],
      variants,
    },
  };
}

// ---------------- Sync Inventory ----------------
async function syncInventory(product, shopifyProduct) {
  const locations = await getShopifyLocations();

  for (let i = 0; i < product.prices.length; i++) {
    const inventoryPerOutlet = product.inventory || [];
    const shopifyVariant = shopifyProduct.variants[i];
    if (!shopifyVariant) continue;

    for (const outlet of inventoryPerOutlet) {
      const location = locations.find(loc => loc.name.trim() === outlet.outlet.name.trim());
      if (!location) continue;
      await setVariantInventory(shopifyVariant.inventory_item_id, location.id, outlet.quantity);
    }
  }
}

// ---------------- 解析选项名获取数量 ----------------
function parseQuantityFromOption(optionName) {
  if (!optionName) return 1;
  if (optionName === 'Single') return 1;
  const match = optionName.match(/(\d+)\s*Pack/);
  return match ? parseInt(match[1]) : 1;
}

// ---------------- Import Product ----------------
export async function importProductToShopify(product) {
  const existing = await findShopifyProductBySFID(product.id);
  
  // 如果有已存在的产品，无论当前状态如何都要处理（更新或归档）
  if (existing) {
    console.log(`⏭️  第一次手动同步，暂时跳过重复产品: ${product.name}`);


    // const payload = buildShopifyProductPayload(product);
    // const updatePayload = {
    //   product: {
    //     id: existing.id,
    //     title: product.name,
    //     body_html: product.description || "",
    //     vendor: product.brand?.name || "Unknown",
    //     product_type: product.category?.name || "",
    //     tags: [`SFID:${product.id}`],
    //     status: product.status === "ACTIVE" ? "active" : "archived", // 更新状态
    //     images: payload.product.images,
    //   },
    // };

    // const resp = await shopifyRequest(`products/${existing.id}.json`, "PUT", updatePayload);
    // const shopifyProduct = resp.product;
    
    // if (product.status === "ACTIVE") {
    //   console.log("🔄 更新活跃产品:", existing.id, product.name);
    //   // 更新 variants
    //   for (const shopifyVariant of shopifyProduct.variants) {
    //     const matchingPrice = product.prices.find(p => {
    //       const barcode = p.barcode || p.sku || "";
    //       return barcode === shopifyVariant.sku;
    //     });
    //     if (!matchingPrice) continue;

    //     const variantPayload = {
    //       variant: {
    //         price: matchingPrice.price.toFixed(2),
    //         sku: matchingPrice.barcode || matchingPrice.sku || "",
    //         barcode: matchingPrice.barcode || matchingPrice.sku || "",
    //       },
    //     };
    //     await shopifyRequest(`products/${existing.id}/variants/${shopifyVariant.id}.json`, "PUT", variantPayload);
    //   }
      
    //   // 同步库存和集合
    //   await syncInventory(product, shopifyProduct);
    //   if (product.category?.name) {
    //     const collection = await getOrCreateCollection(product.category.name);
    //     await addProductToCollection(shopifyProduct.id, collection.id);
    //   }
      
    //   return { updated: true, archived: false, product: shopifyProduct };
      
    // } else {
    //   console.log("📦 归档非活跃产品:", existing.id, product.name);
    //   return { updated: true, archived: true, product: shopifyProduct };
    // }
    
  } else {
    // 新产品：只同步ACTIVE状态的产品
    if (product.status !== "ACTIVE") {
      console.log(`⏭️  跳过非活跃新产品: ${product.name} (状态: ${product.status})`);
      return { 
        updated: false, 
        skipped: true,
        reason: `新产品状态为 ${product.status}`,
        product: null 
      };
    }
    
    // 创建新产品（只有ACTIVE状态会到这里）
    const payload = buildShopifyProductPayload(product);
    const resp = await shopifyRequest("products.json", "POST", payload);
    const shopifyProduct = resp.product;
    
    console.log("🆕 创建新 Shopify 产品:", shopifyProduct.id, product.name);
    
    // 同步库存和集合
    await syncInventory(product, shopifyProduct);
    if (product.category?.name) {
      const collection = await getOrCreateCollection(product.category.name);
      await addProductToCollection(shopifyProduct.id, collection.id);
    }
    
    return { updated: false, archived: false, product: shopifyProduct };
  }
}

export { shopifyRequest };
