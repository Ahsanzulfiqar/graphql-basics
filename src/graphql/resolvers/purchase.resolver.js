import PURCHASE from "../../models/Purchase.js";
import PRODUCT from "../../models/Product.js";
import PRODUCTVARIANT from "../../models/ProductVarient.js";
import WAREHOUSE from "../../models/warehouse.js";
import { Query } from "mongoose";

const purchaseResolvers = {


Query:{

   // ✅ Get all purchases (newest first)
    GetAllPurchases: async () => {
      try {
        const purchases = await PURCHASE.find()
          .sort({ createdAt: -1 })
          .populate("items.product")
          .populate("items.variant");

        return purchases;
      } catch (err) {
        console.error("GetAllPurchases error:", err);
        throw new Error("Failed to fetch purchases");
      }
    },

       GetPurchaseById: async (_, { _id }) => {
      try {
        const purchase = await PURCHASE.findById(_id)
          .populate("items.product")
          .populate("items.variant");

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
  PurchaseItem: {
    product: (parent) => {
      const p = parent.product;
      if (!p) return null;
      return { _id: p._id, name: p.name, sku: p.sku };
    },
    variant: (parent) => {
      const v = parent.variant;
      if (!v) return null;
      return { _id: v._id, name: v.name, sku: v.sku };
    },
  },



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

      // (Optional but good) validate warehouse exists
      const warehouseExists = await WAREHOUSE.findById(warehouseId);
      if (!warehouseExists) {
        throw new Error("Warehouse not found");
      }

      // Build items array with lineTotal
      let subTotal = 0;

      const itemDocs = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        // Optional: validate product
        const product = await PRODUCT.findById(item.productId);
        if (!product) {
          throw new Error(`Product not found for item index ${i}`);
        }

        // Optional: validate variant if provided
        if (item.variantId) {
          const variant = await PRODUCTVARIANT.findById(item.variantId);
          if (!variant) {
            throw new Error(`Variant not found for item index ${i}`);
          }
        }

        const lineTotal = item.quantity * item.purchasePrice;
        subTotal += lineTotal;

        itemDocs.push({
          product: item.productId,
          variant: item.variantId || null,
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
          status: "confirmed", // or "draft" if you prefer
          items: itemDocs,
          subTotal,
          taxAmount: tax,
          totalAmount,
          notes,
          postedToStock: false, // will stay false until you "ReceivePurchase"
        });

        return purchase;
      } catch (err) {
        console.error("CreatePurchase error:", err);
        throw new Error("Failed to create purchase");
      }
    },
  },
};

export default purchaseResolvers;
