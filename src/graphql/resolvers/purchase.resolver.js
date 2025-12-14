import PURCHASE from "../../models/Purchase.js";
import PRODUCT from "../../models/Product.js";
import PRODUCTVARIANT from "../../models/ProductVarient.js";
import WAREHOUSE from "../../models/warehouse.js";
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";
import { ApolloError, UserInputError } from "apollo-server-express";
import mongoose from "mongoose";



  

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

      if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
      throw new UserInputError("Invalid purchase ID format");
      }
      const purchase = await PURCHASE.findById(_id);
       if (!purchase) {
      // 404-style error
      throw new UserInputError("Purchase not found");
    }
        return purchase;
      } catch (err) {
    throw new ApolloError(err.message || "Failed to fetch purchase");
      }
    },

    FilterPurchases: async (_, { filter = {}, page = 1, limit = 20 }) => {
    const query = {};

    // Supplier filter (partial match)
    if (filter.supplierName) {
      query.supplierName = { $regex: filter.supplierName, $options: "i" };
    }

    // Warehouse filter
    if (filter.warehouseId) {
      query.warehouse = new mongoose.Types.ObjectId(filter.warehouseId);
    }

    // Status filter
    if (filter.status) {
      query.status = filter.status;
    }

    // Date range filter
    if (filter.dateFrom || filter.dateTo) {
      query.purchaseDate = {};
      if (filter.dateFrom) query.purchaseDate.$gte = new Date(filter.dateFrom);
      if (filter.dateTo) {
        // include the whole day
        const end = new Date(filter.dateTo);
        end.setHours(23, 59, 59, 999);
        query.purchaseDate.$lte = end;
      }
    }

    // Generic search (invoice, notes, maybe SKU in items)
    if (filter.search) {
      const regex = { $regex: filter.search, $options: "i" };
      query.$or = [
        { invoiceNo: regex },
        { notes: regex },
        { supplierName: regex },
        { "items.sku": regex },
      ];
    }

    const pageNum = Math.max(page, 1);
    const pageSize = Math.max(limit, 1);
    const skip = (pageNum - 1) * pageSize;

    const [total, data] = await Promise.all([
      PURCHASE.countDocuments(query),
      PURCHASE.find(query)
        .sort({ purchaseDate: -1, createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
    ]);

    const totalPages = Math.ceil(total / pageSize) || 1;

    return {
      data,
      total,
      page: pageNum,
      limit: pageSize,
      totalPages,
    };
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
      if (!data.items || data.items.length === 0) {
        throw new UserInputError("At least one purchase item is required.");
      }

      // 1️⃣ Validate Warehouse
      const warehouse = await WAREHOUSE.findById(data.warehouseId);
      if (!warehouse) {
        throw new UserInputError(`Warehouse not found for id: ${data.warehouseId}`);
      }

      // 2️⃣ Collect all product & variant IDs from items
      const productIds = [
        ...new Set(data.items.map((it) => it.product)),
      ].filter(Boolean);

      const variantIds = [
        ...new Set(data.items.map((it) => it.variant)),
      ].filter(Boolean);

      // 3️⃣ Validate Products
      const products = await PRODUCT.find({
        _id: { $in: productIds },
      }).select("_id name sku");

      const foundProductIds = new Set(products.map((p) => p._id.toString()));
      const missingProducts = productIds.filter((id) => !foundProductIds.has(id));

      if (missingProducts.length > 0) {
        throw new UserInputError(
          `Invalid product ids: ${missingProducts.join(", ")}`
        );
      }

      // Create a map: productId → product doc
      const productMap = new Map(
        products.map((p) => [p._id.toString(), p])
      );

      // 4️⃣ Validate Variants
      const variants = await PRODUCTVARIANT.find({
        _id: { $in: variantIds },
      }).select("_id name sku");

      const foundVariantIds = new Set(variants.map((v) => v._id.toString()));
      const missingVariants = variantIds.filter((id) => !foundVariantIds.has(id));

      if (missingVariants.length > 0) {
        throw new UserInputError(
          `Invalid variant ids: ${missingVariants.join(", ")}`
        );
      }

      const variantMap = new Map(
        variants.map((v) => [v._id.toString(), v])
      );

      // 5️⃣ Build items with lineTotal + names/sku from DB
      const items = data.items.map((it) => {
        if (it.quantity <= 0) {
          throw new UserInputError(`Invalid quantity for product ${it.product}`);
        }
        if (it.purchasePrice < 0) {
          throw new UserInputError(`Invalid price for product ${it.product}`);
        }

        const productDoc = productMap.get(it.product);
        const variantDoc = variantMap.get(it.variant);

        const lineTotal = Number(
          (it.quantity * it.purchasePrice).toFixed(2)
        );

        return {
          product: new mongoose.Types.ObjectId(it.product),
          productName: productDoc?.name ?? "",     // prefer DB value
          variant: new mongoose.Types.ObjectId(it.variant),
          variantName: variantDoc?.name ?? "",
          sku: variantDoc?.sku ?? productDoc?.sku ?? it.sku, // fallback to request
          quantity: it.quantity,
          purchasePrice: it.purchasePrice,
          lineTotal,
          batchNo: it.batchNo,
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
        };
      });

      // 6️⃣ Totals
      const subTotal = Number(
        items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
      );
      const taxAmount = Number((data.taxAmount ?? 0).toFixed(2));
      const totalAmount = Number((subTotal + taxAmount).toFixed(2));

      // 7️⃣ Create Purchase
      const doc = await PURCHASE.create({
        supplierName: data.supplierName,
        invoiceNo: data.invoiceNo,
        warehouse: warehouse._id,
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
        status: "draft",
        items,
        subTotal,
        taxAmount,
        totalAmount,
        notes: data.notes,
        postedToStock: false,
      });

      return doc;
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

     UpdatePurchase: async (_, { id, data }) => {

      try {
        const purchase = await PURCHASE.findById(id);
    if (!purchase) {
      throw new UserInputError(`Purchase not found for id: ${id}`);
    }

    // 1️⃣ Optional: warehouse validation if changed
    if (data.warehouseId) {
      const warehouse = await WAREHOUSE.findById(data.warehouseId);
      if (!warehouse) {
        throw new UserInputError(`Warehouse not found for id: ${data.warehouseId}`);
      }
      purchase.warehouse = warehouse._id;
    }

    // 2️⃣ Header fields updates
    if (data.supplierName !== undefined) purchase.supplierName = data.supplierName;
    if (data.invoiceNo !== undefined) purchase.invoiceNo = data.invoiceNo;
    if (data.purchaseDate !== undefined)
      purchase.purchaseDate = new Date(data.purchaseDate);
    if (data.status !== undefined) purchase.status = data.status;
    if (data.notes !== undefined) purchase.notes = data.notes;
    if (data.postedToStock !== undefined)
      purchase.postedToStock = data.postedToStock;

    let items = purchase.items;
    let subTotal = purchase.subTotal;
    let taxAmount = data.taxAmount ?? purchase.taxAmount;
    let totalAmount = purchase.totalAmount;

    // 3️⃣ If items are provided, validate + recompute totals
    if (data.items && data.items.length > 0) {
      const productIds = [
        ...new Set(data.items.map((it) => it.product)),
      ].filter(Boolean);

      const variantIds = [
        ...new Set(data.items.map((it) => it.variant)),
      ].filter(Boolean);

      const products = await PRODUCT.find({ _id: { $in: productIds } }).select(
        "_id name sku"
      );
      const variants = await PRODUCTVARIANT.find({
        _id: { $in: variantIds },
      }).select("_id name sku");

      const productMap = new Map(products.map((p) => [p._id.toString(), p]));
      const variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

      const missingProducts = productIds.filter(
        (id) => !productMap.has(id.toString())
      );
      if (missingProducts.length) {
        throw new UserInputError(
          `Invalid product ids: ${missingProducts.join(", ")}`
        );
      }

      const missingVariants = variantIds.filter(
        (id) => !variantMap.has(id.toString())
      );
      if (missingVariants.length) {
        throw new UserInputError(
          `Invalid variant ids: ${missingVariants.join(", ")}`
        );
      }

      items = data.items.map((it) => {
        if (it.quantity <= 0) {
          throw new UserInputError(`Invalid quantity for product ${it.product}`);
        }
        if (it.purchasePrice < 0) {
          throw new UserInputError(`Invalid price for product ${it.product}`);
        }

        const productDoc = productMap.get(it.product.toString());
        const variantDoc = variantMap.get(it.variant.toString());

        const lineTotal = Number(
          (it.quantity * it.purchasePrice).toFixed(2)
        );

        return {
          product: new mongoose.Types.ObjectId(it.product),
          productName: productDoc?.name ?? it.productName,
          variant: new mongoose.Types.ObjectId(it.variant),
          variantName: variantDoc?.name ?? it.variantName,
          sku: variantDoc?.sku ?? productDoc?.sku ?? it.sku,
          quantity: it.quantity,
          purchasePrice: it.purchasePrice,
          lineTotal,
          batchNo: it.batchNo,
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
        };
      });

      subTotal = Number(
        items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
      );
      taxAmount = Number((data.taxAmount ?? taxAmount ?? 0).toFixed(2));
      totalAmount = Number((subTotal + taxAmount).toFixed(2));

      purchase.items = items;
      purchase.subTotal = subTotal;
      purchase.taxAmount = taxAmount;
      purchase.totalAmount = totalAmount;
    } else if (data.taxAmount !== undefined) {
      // If only tax changes, recompute total
      taxAmount = Number(data.taxAmount.toFixed(2));
      totalAmount = Number((subTotal + taxAmount).toFixed(2));
      purchase.taxAmount = taxAmount;
      purchase.totalAmount = totalAmount;
    }

    await purchase.save();
    return purchase;
      } catch (err) {
    throw new ApolloError(err.message || "Failed to update purchase");
        
      }
    
  },

}
};

export default purchaseResolvers;
