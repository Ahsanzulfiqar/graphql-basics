import PURCHASE from "../../models/Purchase.js";
import PRODUCT from "../../models/Product.js";
import PRODUCTVARIANT from "../../models/ProductVarient.js";
import WAREHOUSE from "../../models/warehouse.js";
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";

import { Query } from "mongoose";

const purchaseResolvers = {


Query:{

     GetAllPurchases: async () => {
      try {
        const purchases = await PURCHASE.find().sort({ createdAt: -1 });
        return purchases;
      } catch (err) {
        console.error("GetAllPurchases error:", err);
        throw new Error("Failed to fetch purchases");
      }
    },

   GetPurchaseById: async (_, { _id }) => {
      try {
        const purchase = await PURCHASE.findById(_id);
        if (!purchase) {
          throw new Error("Purchase not found");
        }
        return purchase;
      } catch (err) {
        console.error("GetPurchaseById error:", err);
        throw new Error("Failed to fetch purchase");
      }
    },


},

  // Map populated Mongoose docs → GraphQL types (ProductBasic & ProductVariantBasic)
//   PurchaseItem: {
//     product: (parent) => {
//       const p = parent.product;
//       if (!p) return null;
//       return { _id: p._id, name: p.name, sku: p.sku };
//     },
//     variant: (parent) => {
//       const v = parent.variant;
//       if (!v) return null;
//       return { _id: v._id, name: v.name, sku: v.sku };
//     },
//   },



  Mutation: {
    CreatePurchase: async (_, { data }) => {
      const {
        supplierName,
        invoiceNo,
        warehouseId,
        purchaseDate,
        items,
        taxAmount,
        notes,
      } = data;

      if (!items || !items.length) {
        throw new Error("At least one item is required in a purchase");
      }

      console.log(warehouseId , "in")
      // Optional: validate warehouse exists
      const warehouseExists = await WAREHOUSE.findById(warehouseId);
      if (!warehouseExists) {
        throw new Error("Warehouse not found");
      }

      let subTotal = 0;
      const itemDocs = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Fetch product
        const product = await PRODUCT.findById(item.productId);
        if (!product) {
          throw new Error(`Product not found for item index ${i}`);
        }
        console.log(product,"product")
        // Fetch variant if provided
        let variant = null;
        if (item.variantId) {
          variant = await PRODUCTVARIANT.findById(item.variantId);
          if (!variant) {
            throw new Error(`Variant not found for item index ${i}`);
          }
        }

        const lineTotal = item.quantity * item.purchasePrice;
        subTotal += lineTotal;
         console.log()
        itemDocs.push({
          product: item.productId,
          variant: item.variantId || null,
          productName: product.name,
          variantName: variant ? variant.name : null,
          sku: variant ? variant.sku : product.sku,
          quantity: item.quantity,
          purchasePrice: item.purchasePrice,
          lineTotal,
          batchNo: item.batchNo || undefined,
          expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
        });
      }

      const tax = typeof taxAmount === "number" ? taxAmount : 0;
      const totalAmount = subTotal + tax;

      try {
        const purchase = await PURCHASE.create({
          supplierName,
          invoiceNo,
          warehouse: warehouseId,
          purchaseDate: purchaseDate ? new Date(purchaseDate) : undefined,
          status: "confirmed", // or "draft" if you want
          items: itemDocs,
          subTotal,
          taxAmount: tax,
          totalAmount,
          notes,
          postedToStock: false,
        });

        return purchase;
      } catch (err) {
        console.error("CreatePurchase error:", err);
        throw new Error("Failed to create purchase");
      }
    },

    ReceivePurchase: async (_, { purchaseId }) => {
      // 1) Load purchase
      const purchase = await PURCHASE.findById(purchaseId);

      if (!purchase) {
        throw new Error("Purchase not found");
      }

      if (purchase.postedToStock) {
        throw new Error("This purchase is already posted to stock");
      }

      if (purchase.status === "cancelled") {
        throw new Error("Cancelled purchase cannot be received");
      }

      // 2) For each item, update WarehouseStock
      for (let i = 0; i < purchase.items.length; i++) {
        const item = purchase.items[i];

        const filter = {
          warehouse: purchase.warehouse,
          product: item.product,
          // allow null variant for non-variant products
          variant: item.variant || null,
        };

        const update = {
          $inc: { quantity: item.quantity },
        };

        // If batch info exists, append to batches array
        if (item.batchNo || item.expiryDate) {
          update.$push = {
            batches: {
              batchNo: item.batchNo || "",
              expiryDate: item.expiryDate || null,
              quantity: item.quantity,
            },
          };
        }

        await WAREHOUSE_STOCK.findOneAndUpdate(filter, update, {
          new: true,
          upsert: true,
        });
      }

      // 3) Mark purchase as received & posted
      purchase.status = "received";
      purchase.postedToStock = true;
      await purchase.save();

      return purchase;
    },
}
};

export default purchaseResolvers;
