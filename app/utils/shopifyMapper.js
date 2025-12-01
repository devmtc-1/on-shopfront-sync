export function mapShopfrontToShopify(products) {
  return products.map((p) => {
    return {
      title: p.name,
      body_html: p.description || "",
      vendor: p.brand ? p.brand.name : "Unknown",
      product_type: p.category ? p.category.name : "Uncategorized",
      images: [
        ...(p.image ? [{ src: p.image }] : []),
        ...p.alternateImages.map((img) => ({ src: img })),
      ],
      variants: p.prices.map((price, index) => {
        const barcodeObj = p.barcodes[index] || p.barcodes[0] || {};
        const inventoryObj = p.inventory[index] || p.inventory[0] || {};
        return {
          option1: `Default Title ${index + 1}`, // 避免重复
          price: price.price.toFixed(2),
          sku: barcodeObj.code || `SKU-${p.id}-${index}`,
          barcode: barcodeObj.code || undefined,
          inventory_quantity: inventoryObj.quantity || 0,
        };
      }),
    };
  });
}
