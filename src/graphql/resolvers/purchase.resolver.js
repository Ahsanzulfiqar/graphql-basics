import PURCHASE from "../../models/Purchase.js";
import PRODUCT from "../../models/Product.js";
import PRODUCTVARIANT from "../../models/ProductVarient.js";
import WAREHOUSE from "../../models/warehouse.js";
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";
import STOCK_LEDGER from "../../models/StockLedger.js";
import { applyStockMovement } from "../../services/stock.helpers.js";




import { requireRoles, requireWarehouseAccess, ensureWarehouseExists } from "../../auth/permissions/permissions.js";
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

    const purchase = await PURCHASE.findById(_id)
      .populate("warehouse", "_id name")
      .lean();

    if (!purchase) {
      throw new UserInputError("Purchase not found");
    }

    return {
      ...purchase,

      // ✅ keep ID field as ID
      warehouse: purchase.warehouse?._id
        ? String(purchase.warehouse._id)
        : String(purchase.warehouse),

      // ✅ extra field
      warehouseName: purchase.warehouse?.name || null,
    };
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





  Mutation: {

CreatePurchase: async (_, { data }, ctx) => {
  try {
    if (!data.items || data.items.length === 0) {
      throw new UserInputError("At least one purchase item is required.");
    }

    // 1) Validate Warehouse
    if (!mongoose.Types.ObjectId.isValid(data.warehouseId)) {
      throw new UserInputError(`Invalid warehouseId: ${data.warehouseId}`);
    }

    const warehouse = await WAREHOUSE.findById(data.warehouseId);
    if (!warehouse) {
      throw new UserInputError(`Warehouse not found for id: ${data.warehouseId}`);
    }

    // 2) Collect product + variant ids
    const productIds = [...new Set(data.items.map((it) => it.product))].filter(Boolean);

    // variant is OPTIONAL
    const variantIds = [...new Set(data.items.map((it) => it.variant))].filter(Boolean);

    // Validate product ids format
    const badProductIds = productIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (badProductIds.length) {
      throw new UserInputError(`Invalid product ids: ${badProductIds.join(", ")}`);
    }

    // Validate variant ids format
    const badVariantIds = variantIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (badVariantIds.length) {
      throw new UserInputError(`Invalid variant ids: ${badVariantIds.join(", ")}`);
    }

    // 3) Fetch products
    const products = await PRODUCT.find({ _id: { $in: productIds } }).select("_id name sku");
    const productMap = new Map(products.map((p) => [p._id.toString(), p]));

    const missingProducts = productIds.filter((id) => !productMap.has(id));
    if (missingProducts.length > 0) {
      throw new UserInputError(`Invalid product ids: ${missingProducts.join(", ")}`);
    }

    // 4) Fetch variants only if provided
    let variantMap = new Map();
    if (variantIds.length > 0) {
      const variants = await PRODUCTVARIANT.find({ _id: { $in: variantIds } }).select("_id name sku");
      variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

      const missingVariants = variantIds.filter((id) => !variantMap.has(id));
      if (missingVariants.length > 0) {
        throw new UserInputError(`Invalid variant ids: ${missingVariants.join(", ")}`);
      }
    }

    // 5) Build items
    const items = data.items.map((it, index) => {
      if (!it.product) {
        throw new UserInputError(`Item at index ${index} is missing product`);
      }

      if (it.quantity == null || it.quantity <= 0) {
        throw new UserInputError(`Invalid quantity for item index ${index}`);
      }

      if (it.purchasePrice == null || it.purchasePrice < 0) {
        throw new UserInputError(`Invalid purchasePrice for item index ${index}`);
      }

      const qty = Number(it.quantity);
      const purchasePrice = Number(it.purchasePrice);

      const productDoc = productMap.get(it.product);
      const variantDoc = it.variant ? variantMap.get(it.variant) : null;

      const lineTotal = Number((qty * purchasePrice).toFixed(2));

      return {
        product: new mongoose.Types.ObjectId(it.product),
        productName: productDoc?.name ?? it.productName ?? "",
        variant: it.variant ? new mongoose.Types.ObjectId(it.variant) : undefined,
        variantName: variantDoc?.name ?? it.variantName ?? "",
        sku: variantDoc?.sku ?? productDoc?.sku ?? it.sku ?? "",
        quantity: qty,
        purchasePrice,
        lineTotal,
        batchNo: it.batchNo,
        expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
      };
    });

    // 6) Totals
    const subTotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
    const taxAmount = Number((data.taxAmount ?? 0).toFixed(2));
    const totalAmount = Number((subTotal + taxAmount).toFixed(2));

    // 7) Payment block
    const paidAmount = Number(data?.payment?.paidAmount ?? 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new UserInputError("Invalid payment.paidAmount");
    }
    if (paidAmount > totalAmount) {
      throw new UserInputError("payment.paidAmount cannot be greater than totalAmount");
    }

    const balanceAmount = Number((totalAmount - paidAmount).toFixed(2));
    const paymentStatus = balanceAmount <= 0 ? "paid" : "unpaid";

    // 8) Create purchase
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

      // ✅ NEW
      payment: {
        status: paymentStatus,
        paidAmount,
        balanceAmount,
        paidAt: paymentStatus === "paid" ? new Date() : undefined,
      },
    });

    return doc;
  } catch (error) {
    console.log(error);
    throw error;
  }
},


    // ReceivePurchase: async (_, { purchaseId },ctx) => {
    //   // requireRoles(ctx, ["WAREHOUSE", "ADMIN"]);
    //   // 1) Load purchase
    //   const purchase = await PURCHASE.findById(purchaseId);

    //   if (!purchase) {
    //     throw new Error("Purchase not found");
    //   }

    // //  await requireWarehouseAccess(ctx, purchase.warehouse);


    //   if (purchase.postedToStock) {
    //     throw new Error("This purchase is already posted to stock");
    //   }

    //   if (purchase.status === "cancelled") {
    //     throw new Error("Cancelled purchase cannot be received");
    //   }

    //   // 2) For each item, update WarehouseStock
    //   for (let i = 0; i < purchase.items.length; i++) {
    //     const item = purchase.items[i];

    //     const filter = {
    //       warehouse: purchase.warehouse,
    //       product: item.product,
    //       // allow null variant for non-variant products
    //       variant: item.variant || null,
    //     };

    //     const update = {
    //       $inc: { quantity: item.quantity },
    //     };

    //     // If batch info exists, append to batches array
    //     if (item.batchNo || item.expiryDate) {
    //       update.$push = {
    //         batches: {
    //           batchNo: item.batchNo || "",
    //           expiryDate: item.expiryDate || null,
    //           quantity: item.quantity,
    //         },
    //       };
    //     }

    //     await WAREHOUSE_STOCK.findOneAndUpdate(filter, update, {
    //       new: true,
    //       upsert: true,
    //     });
    //   }

    //   // 3) Mark purchase as received & posted
    //   purchase.status = "received";
    //   purchase.postedToStock = true;
    //   await purchase.save();

    //   return purchase;
    // },

  UpdatePurchase: async (_, { id, data }, ctx) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError(`Invalid purchase id: ${id}`);
    }

    const purchase = await PURCHASE.findById(id);
    if (!purchase) {
      throw new UserInputError(`Purchase not found for id: ${id}`);
    }

    // 1) Optional: warehouse validation if changed
    if (data.warehouseId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(data.warehouseId)) {
        throw new UserInputError(`Invalid warehouseId: ${data.warehouseId}`);
      }

      const warehouse = await WAREHOUSE.findById(data.warehouseId);
      if (!warehouse) {
        throw new UserInputError(`Warehouse not found for id: ${data.warehouseId}`);
      }
      purchase.warehouse = warehouse._id;
    }

    // 2) Header field updates
    if (data.supplierName !== undefined) purchase.supplierName = data.supplierName;
    if (data.invoiceNo !== undefined) purchase.invoiceNo = data.invoiceNo;
    if (data.purchaseDate !== undefined) purchase.purchaseDate = new Date(data.purchaseDate);
    if (data.status !== undefined) purchase.status = data.status;
    if (data.notes !== undefined) purchase.notes = data.notes;
    if (data.postedToStock !== undefined) purchase.postedToStock = data.postedToStock;

    // Current values
    let items = purchase.items;
    let subTotal = purchase.subTotal;
    let taxAmount = data.taxAmount ?? purchase.taxAmount;
    let totalAmount = purchase.totalAmount;

    // 3) If items are provided, validate + rebuild + recompute totals
    if (Array.isArray(data.items)) {
      // Allow empty array to clear items? If you DON'T want that, change this check
      if (data.items.length === 0) {
        throw new UserInputError("At least one purchase item is required.");
      }

      const productIds = [...new Set(data.items.map((it) => it.product))].filter(Boolean);
      const variantIds = [...new Set(data.items.map((it) => it.variant))].filter(Boolean);

      // Validate ids format
      const badProductIds = productIds.filter((pid) => !mongoose.Types.ObjectId.isValid(pid));
      if (badProductIds.length) {
        throw new UserInputError(`Invalid product ids: ${badProductIds.join(", ")}`);
      }

      const badVariantIds = variantIds.filter((vid) => !mongoose.Types.ObjectId.isValid(vid));
      if (badVariantIds.length) {
        throw new UserInputError(`Invalid variant ids: ${badVariantIds.join(", ")}`);
      }

      // Fetch products
      const products = await PRODUCT.find({ _id: { $in: productIds } }).select("_id name sku");
      const productMap = new Map(products.map((p) => [p._id.toString(), p]));

      const missingProducts = productIds.filter((pid) => !productMap.has(pid));
      if (missingProducts.length) {
        throw new UserInputError(`Invalid product ids: ${missingProducts.join(", ")}`);
      }

      // Fetch variants ONLY if provided
      let variantMap = new Map();
      if (variantIds.length > 0) {
        const variants = await PRODUCTVARIANT.find({ _id: { $in: variantIds } }).select("_id name sku");
        variantMap = new Map(variants.map((v) => [v._id.toString(), v]));

        const missingVariants = variantIds.filter((vid) => !variantMap.has(vid));
        if (missingVariants.length) {
          throw new UserInputError(`Invalid variant ids: ${missingVariants.join(", ")}`);
        }
      }

      // Build items
      items = data.items.map((it, index) => {
        if (!it.product) throw new UserInputError(`Item at index ${index} is missing product`);
        if (it.quantity == null || it.quantity <= 0) {
          throw new UserInputError(`Invalid quantity for item index ${index}`);
        }
        if (it.purchasePrice == null || it.purchasePrice < 0) {
          throw new UserInputError(`Invalid purchasePrice for item index ${index}`);
        }

        const productDoc = productMap.get(it.product);
        const variantDoc = it.variant ? variantMap.get(it.variant) : null;

        const lineTotal = Number((it.quantity * it.purchasePrice).toFixed(2));

        return {
          product: new mongoose.Types.ObjectId(it.product),
          productName: productDoc?.name ?? it.productName ?? "",

          // ✅ variant optional
          variant: it.variant ? new mongoose.Types.ObjectId(it.variant) : undefined,
          variantName: variantDoc?.name ?? it.variantName ?? "",

          sku: variantDoc?.sku ?? productDoc?.sku ?? it.sku ?? "",
          quantity: it.quantity,
          purchasePrice: it.purchasePrice,
          lineTotal,
          batchNo: it.batchNo,
          expiryDate: it.expiryDate ? new Date(it.expiryDate) : undefined,
        };
      });

      // Totals
      subTotal = Number(items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2));
      taxAmount = Number((data.taxAmount ?? taxAmount ?? 0).toFixed(2));
      totalAmount = Number((subTotal + taxAmount).toFixed(2));

      purchase.items = items;
      purchase.subTotal = subTotal;
      purchase.taxAmount = taxAmount;
      purchase.totalAmount = totalAmount;
    } else if (data.taxAmount !== undefined) {
      // If only tax changes, recompute total
      taxAmount = Number((data.taxAmount ?? 0).toFixed(2));
      totalAmount = Number((subTotal + taxAmount).toFixed(2));
      purchase.taxAmount = taxAmount;
      purchase.totalAmount = totalAmount;
    }

    await purchase.save();
    return purchase;
  } catch (err) {
    console.log(err);
    throw new ApolloError(err.message || "Failed to update purchase");
  }
},


PostToStock: async (_, { purchaseId }) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new UserInputError("Invalid purchaseId");
    }

    const purchase = await PURCHASE.findById(purchaseId).session(session).exec();

    if (!purchase || purchase.isDeleted) {
      throw new UserInputError("Purchase not found");
    }

    if (purchase.postedToStock) {
      throw new UserInputError("Purchase already posted to stock");
    }

    if (purchase.status === "cancelled") {
      throw new UserInputError("Cancelled purchase cannot be posted");
    }

    if (purchase.status !== "confirmed") {
      throw new UserInputError("Only confirmed purchases can be posted to stock");
    }

    if (!purchase.items || purchase.items.length === 0) {
      throw new UserInputError("Purchase has no items to post");
    }

    const warehouse = await WAREHOUSE.findById(purchase.warehouse).session(session).exec();
    if (!warehouse) {
      throw new UserInputError("Warehouse not found for this purchase");
    }

    const productIds = [...new Set(purchase.items.map((it) => it.product?.toString()).filter(Boolean))];

    const variantIds = [
      ...new Set(
        purchase.items
          .map((it) => (it.variant ? it.variant.toString() : null))
          .filter(Boolean)
      ),
    ];

    const products = await PRODUCT.find({ _id: { $in: productIds } })
      .select("_id")
      .session(session);

    const productSet = new Set(products.map((p) => p._id.toString()));
    const missingProducts = productIds.filter((id) => !productSet.has(id));
    if (missingProducts.length) {
      throw new UserInputError(`Products not found: ${missingProducts.join(", ")}`);
    }

    if (variantIds.length > 0) {
      const variants = await PRODUCTVARIANT.find({ _id: { $in: variantIds } })
        .select("_id")
        .session(session);

      const variantSet = new Set(variants.map((v) => v._id.toString()));
      const missingVariants = variantIds.filter((id) => !variantSet.has(id));
      if (missingVariants.length) {
        throw new UserInputError(`Variants not found: ${missingVariants.join(", ")}`);
      }
    }

    const ledgerDocs = [];

    for (const item of purchase.items) {
      const qty = Number(item.quantity || 0);

      const row = {
        purchase: purchase._id,
        product: item.product,
        warehouse: purchase.warehouse,
        quantityIn: qty,
        quantityOut: 0,
        batchNo: item.batchNo,
        expiryDate: item.expiryDate,
        refType: "PURCHASE",
        refNo: purchase.invoiceNo || String(purchase._id),
        notes: "Posted from purchase",
      };

      if (item.variant) {
        row.variant = item.variant;
      }

      ledgerDocs.push(row);

      await applyStockMovement(
        {
          warehouse: purchase.warehouse,
          product: item.product,
          variant: item.variant || undefined,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          deltaQty: qty,
          purchasePrice: item.purchasePrice, // ✅ NEW
        },
        session
      );
    }

    if (ledgerDocs.length > 0) {
      await STOCK_LEDGER.insertMany(ledgerDocs, { session });
    }

    purchase.postedToStock = true;
    purchase.status = "received";
    await purchase.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      ...purchase.toObject(),
      warehouse: String(purchase.warehouse),
      warehouseName: warehouse?.name || null,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("PostToStock error:", err);
    throw new ApolloError(err.message || "Failed to post to stock");
  }
},


ConfirmPurchase: async (_, { purchaseId }, ctx) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new UserInputError("Invalid purchaseId");
    }

    const purchase = await PURCHASE.findById(purchaseId);
    if (!purchase || purchase.isDeleted) throw new UserInputError("Purchase not found");

    if (purchase.status === "cancelled") {
      throw new UserInputError("Cancelled purchase cannot be confirmed");
    }

    if (purchase.status === "received" || purchase.postedToStock) {
      throw new UserInputError("Received purchase cannot be confirmed again");
    }

    if (purchase.status !== "draft") {
      throw new UserInputError("Only draft purchases can be confirmed");
    }

    if (!purchase.items || purchase.items.length === 0) {
      throw new UserInputError("Purchase must have at least one item to confirm");
    }

    purchase.status = "confirmed";
    await purchase.save();
    return purchase;
  } catch (err) {
    console.log(err);
    throw new ApolloError(err.message || "Failed to confirm purchase");
  }
},





DeletePurchase: async (_, { id }, ctx) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError(`Invalid purchase id: ${id}`);
    }

    const purchase = await PURCHASE.findById(id).session(session);

    // Not found or already deleted
    if (!purchase || purchase.isDeleted) {
      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // Already cancelled => only soft delete
    if (purchase.status === "cancelled") {
      purchase.isDeleted = true;
      purchase.deletedAt = new Date();
      await purchase.save({ session });

      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // Draft / Confirmed => no stock rollback needed
    if (purchase.status === "draft" || purchase.status === "confirmed") {
      purchase.status = "cancelled";
      purchase.postedToStock = false;
      purchase.isDeleted = true;
      purchase.deletedAt = new Date();
      await purchase.save({ session });

      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // Received => reverse stock + ledger, then soft delete
    if (purchase.status === "received") {
      if (!purchase.postedToStock) {
        purchase.status = "cancelled";
        purchase.isDeleted = true;
        purchase.deletedAt = new Date();
        await purchase.save({ session });

        await session.commitTransaction();
        session.endSession();
        return true;
      }

      if (!purchase.items || purchase.items.length === 0) {
        throw new UserInputError("Cannot rollback: purchase has no items");
      }

      const reverseLedgerDocs = [];

      for (const item of purchase.items) {
        const qty = Number(item.quantity || 0);

        if (!qty || qty <= 0) {
          throw new UserInputError("Invalid item quantity in purchase");
        }

        await applyStockMovement(
          {
            warehouse: purchase.warehouse,
            product: item.product,
            variant: item.variant || undefined,
            batchNo: item.batchNo,
            expiryDate: item.expiryDate,
            deltaQty: -qty,
          },
          session
        );

        const ledgerRow = {
          purchase: purchase._id,
          product: item.product,
          warehouse: purchase.warehouse,
          quantityIn: 0,
          quantityOut: qty,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          refType: "ADJUSTMENT",
          refNo: `REV-${purchase.invoiceNo || purchase._id}`,
          notes: "Reversal of received purchase on delete",
        };

        if (item.variant) {
          ledgerRow.variant = item.variant;
        }

        reverseLedgerDocs.push(ledgerRow);
      }

      if (reverseLedgerDocs.length > 0) {
        await STOCK_LEDGER.insertMany(reverseLedgerDocs, { session });
      }

      purchase.status = "cancelled";
      purchase.postedToStock = false;
      purchase.isDeleted = true;
      purchase.deletedAt = new Date();
      await purchase.save({ session });

      await session.commitTransaction();
      session.endSession();
      return true;
    }

    throw new UserInputError(`Unsupported purchase status: ${purchase.status}`);
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("DeletePurchase error:", err);
    throw new ApolloError(err.message || "Failed to delete purchase");
  }
},

  
AddManualStock: async (_, { data }, ctx) => {

  if (!ctx.user) throw new AuthenticationError("Login required");
  if (!["ADMIN", "MANAGER", "WAREHOUSE"].includes(ctx.user.role)) {
    throw new ForbiddenError("User Not allowed to add manual stock");
  }

  const {
    warehouseId,
    productId,
    variantId,
    quantity,
    batchNo,
    expiryDate,
    note,
  } = data;

  if (quantity <= 0) {
    throw new UserInputError("Quantity must be greater than 0");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate warehouse
    const warehouse = await WAREHOUSE.findById(warehouseId).session(session);
    if (!warehouse) throw new UserInputError("Warehouse not found");

    // Validate product
    const product = await PRODUCT.findById(productId).session(session);
    if (!product) throw new UserInputError("Product not found");

    // Validate variant (if provided)
    if (variantId) {

      const variant = await PRODUCTVARIANT.findById(variantId).session(session);
      if (!variant) throw new UserInputError("Variant not found");
      if (String(variant.product) !== String(productId)) {
        throw new UserInputError("Variant does not belong to product");
      }
    }

    // Build query
    const query = {
      warehouse: warehouseId,
      product: productId,
    };
    if (variantId) query.variant = variantId;

    let stock = await WAREHOUSE_STOCK.findOne(query).session(session);

    // Create stock record if missing
    if (!stock) {
      stock = new WAREHOUSE_STOCK({
        warehouse: warehouseId,
        product: productId,
        variant: variantId,
        quantity: 0,
        reserved: 0,
        batches: [],
      });
    }

    // Increase main quantity
    stock.quantity += quantity;

    // Handle batches
    if (batchNo) {
      const existingBatch = stock.batches.find(
        (b) =>
          b.batchNo === batchNo &&
          String(b.expiryDate || "") === String(expiryDate || "")
      );

      if (existingBatch) {
        existingBatch.quantity += quantity;
      } else {
        stock.batches.push({
          batchNo,
          expiryDate: expiryDate ? new Date(expiryDate) : undefined,
          quantity,
        });
      }
    }

    await stock.save({ session });

    // 📒 Ledger entry
    await STOCK_LEDGER.create(
      [
        {
          warehouse: warehouseId,
          product: productId,
          variant: variantId,
          quantityIn: quantity,
          quantityOut: 0,
          batchNo,
          expiryDate,
          refType: "ADJUSTMENT",
          refNo: `MAN-${Date.now()}`,
          notes: note || "Manual stock addition",
          createdBy: ctx.user._id,
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return stock;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message || "Failed to add manual stock");
  }
},

  
}
};

export default purchaseResolvers;
