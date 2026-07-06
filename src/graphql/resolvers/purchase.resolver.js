import PURCHASE from "../../models/Purchase.js";
import PRODUCT from "../../models/Product.js";
import PRODUCTVARIANT from "../../models/ProductVarient.js";
import WAREHOUSE from "../../models/warehouse.js";
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";
import STOCK_LEDGER from "../../models/StockLedger.js";
import { applyStockMovement } from "../../services/stock.helpers.js";
 import { postPurchaseVoucher } from "../../services/accounting.helpers.js";

import {
  ApolloError,
  UserInputError,
  AuthenticationError,
  ForbiddenError,
} from "apollo-server-express";

import mongoose from "mongoose";
import COUNTER from "../../models/Counter.js";


const toId = (id) => new mongoose.Types.ObjectId(id);

const purchaseResolvers = {
  Query: {
    GetAllPurchases: async () => {
      try {
        const purchases = await PURCHASE.find({ isDeleted: { $ne: true } })
          .populate("warehouse", "_id name")
          .sort({ createdAt: -1 })
          .lean();

        return purchases.map((p) => ({
          ...p,
          warehouse: p.warehouse?._id ? String(p.warehouse._id) : String(p.warehouse),
          warehouseName: p.warehouse?.name || null,
        }));
      } catch (err) {
        console.error("GetAllPurchases error:", err);
        throw new ApolloError("Failed to fetch purchases");
      }
    },

    GetPurchaseById: async (_, { _id }) => {
      try {
        if (!_id || !mongoose.Types.ObjectId.isValid(_id)) {
          throw new UserInputError("Invalid purchase ID format");
        }

        const purchase = await PURCHASE.findOne({
          _id,
          isDeleted: { $ne: true },
        })
          .populate("warehouse", "_id name")
          .lean();

        if (!purchase) {
          throw new UserInputError("Purchase not found");
        }

        return {
          ...purchase,
          warehouse: purchase.warehouse?._id
            ? String(purchase.warehouse._id)
            : String(purchase.warehouse),
          warehouseName: purchase.warehouse?.name || null,
        };
      } catch (err) {
        throw new ApolloError(err.message || "Failed to fetch purchase");
      }
    },

    FilterPurchases: async (_, { filter = {}, page = 1, limit = 20 }) => {
      try {
        const query = { isDeleted: { $ne: true } };

        if (filter.supplierName) {
          query.supplierName = { $regex: filter.supplierName, $options: "i" };
        }

        if (filter.warehouseId) {
          if (!mongoose.Types.ObjectId.isValid(filter.warehouseId)) {
            throw new UserInputError("Invalid warehouseId");
          }
          query.warehouse = toId(filter.warehouseId);
        }

        if (filter.status) {
          query.status = filter.status;
        }

        if (filter.dateFrom || filter.dateTo) {
          query.purchaseDate = {};
          if (filter.dateFrom) query.purchaseDate.$gte = new Date(filter.dateFrom);
          if (filter.dateTo) {
            const end = new Date(filter.dateTo);
            end.setHours(23, 59, 59, 999);
            query.purchaseDate.$lte = end;
          }
        }

        if (filter.search) {
          const regex = { $regex: filter.search, $options: "i" };
          query.$or = [
            { invoiceNo: regex },
            { notes: regex },
            { supplierName: regex },
            { "items.sku": regex },
            { "items.productName": regex },
          ];
        }

        const pageNum = Math.max(page, 1);
        const pageSize = Math.max(limit, 1);
        const skip = (pageNum - 1) * pageSize;

        const [total, data] = await Promise.all([
          PURCHASE.countDocuments(query),
          PURCHASE.find(query)
            .populate("warehouse", "_id name")
            .sort({ purchaseDate: -1, createdAt: -1 })
            .skip(skip)
            .limit(pageSize)
            .lean(),
        ]);

        return {
          data: data.map((p) => ({
            ...p,
            warehouse: p.warehouse?._id ? String(p.warehouse._id) : String(p.warehouse),
            warehouseName: p.warehouse?.name || null,
          })),
          total,
          page: pageNum,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize) || 1,
        };
      } catch (err) {
        throw new ApolloError(err.message || "Failed to filter purchases");
      }
    },
  },

  Mutation: {
  CreatePurchase: async (_, { data }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  if (!["ADMIN", "MANAGER", "WAREHOUSE"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to create purchase");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!data.items || data.items.length === 0) {
      throw new UserInputError("At least one purchase item is required.");
    }

    if (!mongoose.Types.ObjectId.isValid(data.warehouseId)) {
      throw new UserInputError(`Invalid warehouseId: ${data.warehouseId}`);
    }

    const warehouse = await WAREHOUSE.findById(data.warehouseId).session(session);
    if (!warehouse) {
      throw new UserInputError("Warehouse not found");
    }

    const productIds = [...new Set(data.items.map((it) => it.product))].filter(Boolean);
    const variantIds = [...new Set(data.items.map((it) => it.variant))].filter(Boolean);

    const badProductIds = productIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (badProductIds.length) {
      throw new UserInputError(`Invalid product ids: ${badProductIds.join(", ")}`);
    }

    const badVariantIds = variantIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (badVariantIds.length) {
      throw new UserInputError(`Invalid variant ids: ${badVariantIds.join(", ")}`);
    }

    const products = await PRODUCT.find({ _id: { $in: productIds } })
      .select("_id name sku")
      .session(session);

    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const missingProducts = productIds.filter((id) => !productMap.has(String(id)));
    if (missingProducts.length) {
      throw new UserInputError(`Products not found: ${missingProducts.join(", ")}`);
    }

    let variantMap = new Map();

    if (variantIds.length > 0) {
      const variants = await PRODUCTVARIANT.find({ _id: { $in: variantIds } })
        .select("_id product name sku")
        .session(session);

      variantMap = new Map(variants.map((v) => [String(v._id), v]));

      const missingVariants = variantIds.filter((id) => !variantMap.has(String(id)));
      if (missingVariants.length) {
        throw new UserInputError(`Variants not found: ${missingVariants.join(", ")}`);
      }
    }

    const items = data.items.map((it, index) => {
      if (!it.product) {
        throw new UserInputError(`Item ${index + 1}: product is required`);
      }

      if (it.quantity == null || Number(it.quantity) <= 0) {
        throw new UserInputError(`Item ${index + 1}: quantity must be greater than 0`);
      }

      const productDoc = productMap.get(String(it.product));
      const variantDoc = it.variant ? variantMap.get(String(it.variant)) : null;

      if (variantDoc && String(variantDoc.product) !== String(it.product)) {
        throw new UserInputError(`Item ${index + 1}: variant does not belong to product`);
      }

      return {
        product: toId(it.product),
        productName: productDoc.name,
        variant: it.variant ? toId(it.variant) : undefined,
        variantName: variantDoc?.name || "",
        sku: variantDoc?.sku || productDoc.sku,
        quantity: Number(it.quantity),
        purchasePrice: undefined,
        lineTotal: 0,
        batchNo: undefined,
        expiryDate: undefined,
      };
    });

    const counter = await COUNTER.findOneAndUpdate(
      { key: "purchase" },
      { $inc: { seq: 1 } },
      {
        new: true,
        upsert: true,
        session,
      }
    );

    const purchaseNo = `PUR-${String(counter.seq).padStart(6, "0")}`;
    const now = new Date();

    const [purchase] = await PURCHASE.create(
      [
        {
          purchaseNo,
          supplierName: data.supplierName,
          invoiceNo: data.invoiceNo,
          warehouse: warehouse._id,
          purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : now,
          status: "draft",
          items,
          subTotal: 0,
          taxAmount: 0,
          totalAmount: 0,
          notes: data.notes,
          postedToStock: false,
          createdBy: ctx.user._id,
          updatedBy: ctx.user._id,
          payment: {
            status: "unpaid",
            paidAmount: 0,
            balanceAmount: 0,
          },
          statusTimestamps: {
            draftAt: now,
          },
          statusHistory: [
            {
              status: "draft",
              at: now,
              by: ctx.user._id,
              note: "Purchase created",
            },
          ],
        },
      ],
      { session }
    );

    await session.commitTransaction();
    session.endSession();

    return purchase;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("CreatePurchase error:", err);

    if (err?.code === 11000) {
      throw new UserInputError("Duplicate purchase number");
    }

    if (
      err instanceof UserInputError ||
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError
    ) {
      throw err;
    }

    throw new ApolloError(err.message || "Failed to create purchase");
  }
},

UpdatePurchase: async (_, { id, data }, ctx) => {
  try {
    // 🔐 AUTH CHECK
    if (!ctx.user) {
      throw new AuthenticationError("Login required");
    }

    if (ctx.user.role !== "ADMIN") {
      throw new ForbiddenError("Only admin can update purchase");
    }

    // 🔍 Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError("Invalid purchase id");
    }

    const purchase = await PURCHASE.findOne({
      _id: id,
      isDeleted: { $ne: true },
    });

    if (!purchase) {
      throw new UserInputError("Purchase not found");
    }

    // ❌ Block invalid states
    if (purchase.postedToStock || purchase.status === "received") {
      throw new UserInputError("Received purchase cannot be updated");
    }

    if (purchase.status === "cancelled") {
      throw new UserInputError("Cancelled purchase cannot be updated");
    }

    // 🏬 Warehouse update
    if (data.warehouseId !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(data.warehouseId)) {
        throw new UserInputError("Invalid warehouseId");
      }

      const warehouse = await WAREHOUSE.findById(data.warehouseId);
      if (!warehouse) throw new UserInputError("Warehouse not found");

      purchase.warehouse = warehouse._id;
    }

    // 🧾 Basic fields
    if (data.supplierName !== undefined) purchase.supplierName = data.supplierName;
    if (data.invoiceNo !== undefined) purchase.invoiceNo = data.invoiceNo;
    if (data.purchaseDate !== undefined) purchase.purchaseDate = new Date(data.purchaseDate);
    if (data.notes !== undefined) purchase.notes = data.notes;

    // 📦 Update items
    if (Array.isArray(data.items)) {
      if (data.items.length === 0) {
        throw new UserInputError("At least one purchase item is required.");
      }

      const productIds = [...new Set(data.items.map((it) => it.product))].filter(Boolean);
      const variantIds = [...new Set(data.items.map((it) => it.variant))].filter(Boolean);

      const products = await PRODUCT.find({ _id: { $in: productIds } }).select("_id name sku");
      const productMap = new Map(products.map((p) => [String(p._id), p]));

      let variantMap = new Map();

      if (variantIds.length > 0) {
        const variants = await PRODUCTVARIANT.find({ _id: { $in: variantIds } }).select(
          "_id product name sku"
        );
        variantMap = new Map(variants.map((v) => [String(v._id), v]));
      }

      purchase.items = data.items.map((it, index) => {
        if (!mongoose.Types.ObjectId.isValid(it.product)) {
          throw new UserInputError(`Item ${index + 1}: invalid product`);
        }

        if (it.variant && !mongoose.Types.ObjectId.isValid(it.variant)) {
          throw new UserInputError(`Item ${index + 1}: invalid variant`);
        }

        if (Number(it.quantity) <= 0) {
          throw new UserInputError(`Item ${index + 1}: quantity must be greater than 0`);
        }

        const productDoc = productMap.get(String(it.product));
        if (!productDoc) {
          throw new UserInputError(`Item ${index + 1}: product not found`);
        }

        const variantDoc = it.variant ? variantMap.get(String(it.variant)) : null;

        if (it.variant && !variantDoc) {
          throw new UserInputError(`Item ${index + 1}: variant not found`);
        }

        if (variantDoc && String(variantDoc.product) !== String(it.product)) {
          throw new UserInputError(`Item ${index + 1}: variant does not belong to product`);
        }

        return {
          product: new mongoose.Types.ObjectId(it.product),
          productName: productDoc.name,
          variant: it.variant ? new mongoose.Types.ObjectId(it.variant) : undefined,
          variantName: variantDoc?.name || "",
          sku: variantDoc?.sku || productDoc.sku,
          quantity: Number(it.quantity),

          // 🔁 reset pricing (will be added in PostToStock)
          purchasePrice: undefined,
          lineTotal: 0,
          batchNo: undefined,
          expiryDate: undefined,
        };
      });
    }

    // 🔄 Reset flow
    purchase.status = "draft";
    purchase.subTotal = 0;
    purchase.taxAmount = 0;
    purchase.totalAmount = 0;

    purchase.payment = {
      status: "unpaid",
      paidAmount: 0,
      balanceAmount: 0,
    };

    await purchase.save();

    return purchase;
  } catch (err) {
    console.error("UpdatePurchase error:", err);
    throw new ApolloError(err.message || "Failed to update purchase");
  }
},

  ConfirmPurchase: async (_, { purchaseId }, ctx) => {
  try {
    if (!ctx.user) throw new AuthenticationError("Login required");

    if (!["ADMIN", "MANAGER", "WAREHOUSE"].includes(ctx.user.role)) {
      throw new ForbiddenError("Not allowed to confirm purchase");
    }

    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new UserInputError("Invalid purchaseId");
    }

    const purchase = await PURCHASE.findOne({
      _id: purchaseId,
      isDeleted: { $ne: true },
    });

    if (!purchase) throw new UserInputError("Purchase not found");

    if (purchase.status !== "draft") {
      throw new UserInputError("Only draft purchase can be confirmed");
    }

    if (!purchase.items || purchase.items.length === 0) {
      throw new UserInputError("Purchase must have at least one item");
    }

    purchase.status = "confirmed";

    purchase.statusTimestamps = purchase.statusTimestamps || {};
    purchase.statusTimestamps.confirmedAt = new Date();

    purchase.statusHistory = purchase.statusHistory || [];
    purchase.statusHistory.push({
      status: "confirmed",
      at: new Date(),
      by: ctx.user._id,
      note: "Purchase confirmed",
    });

    purchase.updatedBy = ctx.user._id;

    await purchase.save();

    return purchase;
  } catch (err) {
    console.error("ConfirmPurchase error:", err);

    if (
      err instanceof UserInputError ||
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError
    ) {
      throw err;
    }

    throw new ApolloError(err.message || "Failed to confirm purchase");
  }
},

  PostToStock: async (_, { purchaseId, items, taxAmount = 0 }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  if (!["ADMIN", "MANAGER", "WAREHOUSE"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to post purchase to stock");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
      throw new UserInputError("Invalid purchaseId");
    }

    const purchase = await PURCHASE.findById(purchaseId).session(session);

    if (!purchase || purchase.isDeleted) {
      throw new UserInputError("Purchase not found");
    }

    if (purchase.postedToStock) {
      throw new UserInputError("Purchase already posted to stock");
    }

    if (purchase.status !== "confirmed") {
      throw new UserInputError("Only confirmed purchases can be posted to stock");
    }

    if (!purchase.items || purchase.items.length === 0) {
      throw new UserInputError("Purchase has no items");
    }

    if (!items || items.length !== purchase.items.length) {
      throw new UserInputError("PostToStock items must match purchase items count");
    }

    const seen = new Set();

    for (const it of items) {
      const key = `${String(it.product)}-${String(it.variant || "no-variant")}`;

      if (seen.has(key)) {
        throw new UserInputError("Duplicate product/variant in PostToStock items");
      }

      seen.add(key);
    }

    const warehouse = await WAREHOUSE.findById(purchase.warehouse).session(session);

    if (!warehouse) {
      throw new UserInputError("Warehouse not found");
    }

    const safeTaxAmount = Number(taxAmount || 0);

    if (!Number.isFinite(safeTaxAmount) || safeTaxAmount < 0) {
      throw new UserInputError("Invalid taxAmount");
    }

    let subTotal = 0;

    for (const pItem of purchase.items) {
      const matchingItem = items.find((it) => {
        const sameProduct = String(it.product) === String(pItem.product);
        const sameVariant = String(it.variant || "") === String(pItem.variant || "");
        return sameProduct && sameVariant;
      });

      if (!matchingItem) {
        throw new UserInputError(`Missing stock details for product ${pItem.product}`);
      }

      const purchasePrice = Number(matchingItem.purchasePrice);

      if (!Number.isFinite(purchasePrice) || purchasePrice < 0) {
        throw new UserInputError(`Purchase price is required for product ${pItem.product}`);
      }

let expiryDate = undefined;

if (matchingItem.expiryDate) {
  expiryDate = new Date(matchingItem.expiryDate);

  if (Number.isNaN(expiryDate.getTime())) {
    throw new UserInputError(`Invalid expiryDate for product ${pItem.product}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiryDay = new Date(expiryDate);
  expiryDay.setHours(0, 0, 0, 0);

  if (expiryDay < today) {
    throw new UserInputError(
      `Expiry date cannot be in the past for product ${pItem.productName}`
    );
  }
}

pItem.purchasePrice = purchasePrice;
pItem.batchNo = matchingItem.batchNo?.trim() || undefined;
pItem.expiryDate = expiryDate;
      pItem.lineTotal = Number((Number(pItem.quantity) * purchasePrice).toFixed(2));

      subTotal += pItem.lineTotal;
    }

    purchase.subTotal = Number(subTotal.toFixed(2));
    purchase.taxAmount = Number(safeTaxAmount.toFixed(2));
    purchase.totalAmount = Number((purchase.subTotal + purchase.taxAmount).toFixed(2));

    purchase.payment = {
      status: "unpaid",
      paidAmount: 0,
      balanceAmount: purchase.totalAmount,
    };

    const ledgerDocs = [];

    for (const item of purchase.items) {
      const qty = Number(item.quantity || 0);

      if (qty <= 0) {
        throw new UserInputError("Invalid item quantity");
      }

      await applyStockMovement(
        {
          warehouse: purchase.warehouse,
          product: item.product,
          variant: item.variant || undefined,
          batchNo: item.batchNo,
          expiryDate: item.expiryDate,
          deltaQty: qty,
          purchasePrice: item.purchasePrice,
        },
        session
      );

      const ledgerRow = {
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
        createdBy: ctx.user._id,
      };

      if (item.variant) {
        ledgerRow.variant = item.variant;
      }

      ledgerDocs.push(ledgerRow);
    }

    if (ledgerDocs.length > 0) {
      await STOCK_LEDGER.insertMany(ledgerDocs, { session });
    }

       if (!purchase.accounting?.purchasePosted) {
  const voucher = await postPurchaseVoucher(purchase, ctx.user, session);

  purchase.accounting = purchase.accounting || {};
  purchase.accounting.purchasePosted = true;
  purchase.accounting.purchaseVoucher = voucher._id;
}


    purchase.status = "received";
    purchase.postedToStock = true;

    purchase.statusTimestamps = purchase.statusTimestamps || {};
    purchase.statusTimestamps.receivedAt = new Date();

    purchase.statusHistory = purchase.statusHistory || [];
    purchase.statusHistory.push({
      status: "received",
      at: new Date(),
      by: ctx.user._id,
      note: "Purchase posted to stock",
    });

    purchase.updatedBy = ctx.user._id;
    await purchase.save({ session });

    await session.commitTransaction();
    session.endSession();

    return {
      ...purchase.toObject(),
      warehouse: String(purchase.warehouse),
      warehouseName: warehouse.name || null,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("PostToStock error:", err);

    if (
      err instanceof UserInputError ||
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError
    ) {
      throw err;
    }

    throw new ApolloError(err.message || "Failed to post to stock");
  }
},

    CancelPurchase: async (_, { purchaseId, reason }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(purchaseId)) {
          throw new UserInputError("Invalid purchaseId");
        }

        const purchase = await PURCHASE.findOne({
          _id: purchaseId,
          isDeleted: { $ne: true },
        });

        if (!purchase) throw new UserInputError("Purchase not found");

        if (purchase.status === "received" || purchase.postedToStock) {
          throw new UserInputError("Received purchase cannot be cancelled directly. Delete it to rollback stock.");
        }

        purchase.status = "cancelled";
        purchase.notes = reason ? `${purchase.notes || ""}\nCancel reason: ${reason}` : purchase.notes;

        await purchase.save();
        return purchase;
      } catch (err) {
        throw new ApolloError(err.message || "Failed to cancel purchase");
      }
    },

  DeletePurchase: async (_, { id }, ctx) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ Login check
    if (!ctx.user) {
      throw new AuthenticationError("Login required");
    }

    // ✅ Only ADMIN can delete purchase
    if (ctx.user.role !== "ADMIN") {
      throw new ForbiddenError("Only admin can delete purchase");
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError("Invalid purchase id");
    }

    const purchase = await PURCHASE.findById(id).session(session);

    if (!purchase || purchase.isDeleted) {
      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // ✅ If stock was posted, reverse stock first
    if (purchase.status === "received" && purchase.postedToStock) {
      const reverseLedgerDocs = [];

      for (const item of purchase.items) {
        const qty = Number(item.quantity || 0);

        if (qty <= 0) {
          throw new UserInputError("Invalid item quantity");
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
    }

    // ✅ Soft delete purchase
    purchase.status = "cancelled";
    purchase.postedToStock = false;
    purchase.isDeleted = true;
    purchase.deletedAt = new Date();

    await purchase.save({ session });

    await session.commitTransaction();
    session.endSession();

    return true;
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
        throw new ForbiddenError("User not allowed to add manual stock");
      }

      const { warehouseId, productId, variantId, quantity, batchNo, expiryDate, note } = data;

      if (quantity <= 0) {
        throw new UserInputError("Quantity must be greater than 0");
      }

      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const warehouse = await WAREHOUSE.findById(warehouseId).session(session);
        if (!warehouse) throw new UserInputError("Warehouse not found");

        const product = await PRODUCT.findById(productId).session(session);
        if (!product) throw new UserInputError("Product not found");

        if (variantId) {
          const variant = await PRODUCTVARIANT.findById(variantId).session(session);
          if (!variant) throw new UserInputError("Variant not found");

          if (String(variant.product) !== String(productId)) {
            throw new UserInputError("Variant does not belong to product");
          }
        }

        await applyStockMovement(
          {
            warehouse: warehouseId,
            product: productId,
            variant: variantId || undefined,
            batchNo,
            expiryDate,
            deltaQty: quantity,
          },
          session
        );

        await STOCK_LEDGER.create(
          [
            {
              warehouse: warehouseId,
              product: productId,
              variant: variantId || undefined,
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

        const stock = await WAREHOUSE_STOCK.findOne({
          warehouse: warehouseId,
          product: productId,
          ...(variantId ? { variant: variantId } : {}),
        }).session(session);

        await session.commitTransaction();
        session.endSession();

        return stock;
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        throw new ApolloError(err.message || "Failed to add manual stock");
      }
    },
  },
};

export default purchaseResolvers;