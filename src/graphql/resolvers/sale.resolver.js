import mongoose from "mongoose";
import { ApolloError, UserInputError,AuthenticationError,ForbiddenError } from "apollo-server-express";
import SALE from "../../models/Sale.js";
import SELLER from "../../models/Seller.js";
import WAREHOUSE from "../../models/warehouse.js";
import PRODUCT from "../../models/Product.js";
import PRODUCT_VARIANT from "../../models/ProductVarient.js";
import STOCK_LEDGER from "../../models/StockLedger.js";
import COURIER from "../../models/Courier.js"
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";
import { reserveStock, releaseReservedStock,addBackToBatch } from "../../services/stock.helpers.js";
import { fifoConsume } from "../../services/fifoConsume.js";
import { requireRoles, requireWarehouseAccess, ensureWarehouseExists } from "../../auth/permissions/permissions.js";
import PROJECT from "../../models/Project.js";


function pushHistory(sale, { status, by, note }) {
  sale.statusHistory = sale.statusHistory || [];
  sale.statusHistory.push({ status, at: new Date(), by, note });

  sale.statusTimestamps = sale.statusTimestamps || {};
  if (status === "draft") sale.statusTimestamps.draftAt = sale.statusTimestamps.draftAt || new Date();
  if (status === "confirmed") sale.statusTimestamps.confirmedAt = new Date();
  if (status === "out_for_delivery") sale.statusTimestamps.outForDeliveryAt = new Date();
  if (status === "delivered") sale.statusTimestamps.deliveredAt = new Date();
  if (status === "cancelled") sale.statusTimestamps.cancelledAt = new Date();
  if (status === "returned") sale.statusTimestamps.returnedAt = new Date();
}

 const saleResolvers = {
  Query: {
    FilterSales: async (_, { filter = {}, page = 1, limit = 20 }) => {
      const q = { isDeleted: { $ne: true } };

      if (filter.sellerId) q.seller = filter.sellerId;
      if (filter.warehouseId) q.warehouse = filter.warehouseId;
      if (filter.status) q.status = filter.status;

      if (filter.dateFrom || filter.dateTo) {
        q.createdAt = {};
        if (filter.dateFrom) q.createdAt.$gte = new Date(filter.dateFrom);
        if (filter.dateTo) {
          const end = new Date(filter.dateTo);
          end.setHours(23, 59, 59, 999);
          q.createdAt.$lte = end;
        }
      }

      if (filter.search) {
        const regex = { $regex: filter.search, $options: "i" };
        q.$or = [{ invoiceNo: regex }, { customerName: regex }, { customerPhone: regex }, { "items.sku": regex }];
      }

      const skip = (Math.max(page, 1) - 1) * Math.max(limit, 1);

      const [total, data] = await Promise.all([
        SALE.countDocuments(q),
        SALE.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit),
      ]);

      return { data, total, page, limit, totalPages: Math.ceil(total / limit) || 1 };
    },

    GetSaleById: async (_, { id }) => {
      const sale = await SALE.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!sale) throw new UserInputError("Sale not found");
      return sale;
    },

  GetSalesSummaryBySeller: async (_, { projectId, sellerId, dateFrom, dateTo }) => {
  const match = {
    isDeleted: { $ne: true },
    status: "delivered",
  };

  if (projectId) {
    if (!mongoose.Types.ObjectId.isValid(projectId)) {
      throw new UserInputError("Invalid projectId");
    }
    match.project = new mongoose.Types.ObjectId(projectId);
  }

  if (sellerId) {
    if (!mongoose.Types.ObjectId.isValid(sellerId)) {
      throw new UserInputError("Invalid sellerId");
    }
    match.seller = new mongoose.Types.ObjectId(sellerId);
  }

  if (dateFrom || dateTo) {
    match.createdAt = {};

    if (dateFrom) {
      match.createdAt.$gte = new Date(dateFrom);
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  const rows = await SALE.aggregate([
    { $match: match },
    {
      $group: {
        _id: "$seller",
        totalSales: { $sum: "$totalAmount" },
        totalOrders: { $sum: 1 },
      },
    },
    {
      $project: {
        seller: "$_id",
        totalSales: 1,
        totalOrders: 1,
        _id: 0,
      },
    },
  ]);

  return rows;
},

        GetAllSales: async (_, { page = 1, limit = 20 }) => {
      try {
        const safePage = Math.max(page, 1);
        const safeLimit = Math.max(limit, 1);
        const skip = (safePage - 1) * safeLimit;

        const query = { isDeleted: { $ne: true } };

        const [total, data] = await Promise.all([
          SALE.countDocuments(query),
          SALE.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(safeLimit),
        ]);

        return {
          data,
          total,
          page: safePage,
          limit: safeLimit,
          totalPages: Math.ceil(total / safeLimit) || 1,
        };
      } catch (err) {
        console.log(err,"err")
        throw new ApolloError("Failed to fetch sales");
      }
    },

  },

  Mutation: {
    //  CreateSale: async (_, { data }, ctx) => {

    //   if (!ctx.user) throw new AuthenticationError("Login required");
    //     const isInternal = ["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role);
    //     const isSeller = ctx.user.role === "SELLER" || ctx.user.role ==="SALES";


    //   const session = await mongoose.startSession();
    //   session.startTransaction();
    //   try {
    //     // Validate seller + warehouse
    //     const seller = await SELLER.findOne({ _id: data.sellerId, isDeleted: { $ne: true } }).session(session);
    //     if (!seller) throw new UserInputError("Seller not found");

    //     const warehouse = await WAREHOUSE.findById(data.warehouseId).session(session);
    //     if (!warehouse) throw new UserInputError("Warehouse not found");

    //     if (!data.items || data.items.length === 0) throw new UserInputError("Sale items required");

    //     // Validate products/variants exist (IDs)
    //     const productIds = [...new Set(data.items.map((i) => i.productId))];
    //     const variantIds = [...new Set(data.items.filter((i) => i.variantId).map((i) => i.variantId))];

    //     const [products, variants] = await Promise.all([
    //       PRODUCT.find({ _id: { $in: productIds } }).select("_id").session(session),
    //       PRODUCT_VARIANT.find({ _id: { $in: variantIds } }).select("_id product").session(session),
    //     ]);

    //     if (products.length !== productIds.length) throw new UserInputError("One or more products not found");
    //     if (variantIds.length && variants.length !== variantIds.length) throw new UserInputError("One or more variants not found");

    //     // Optional: ensure each variant belongs to its product (recommended)
    //     const variantMap = new Map(variants.map((v) => [String(v._id), String(v.product)]));
    //     for (const it of data.items) {
    //       if (it.variantId) {
    //         const belongsTo = variantMap.get(String(it.variantId));
    //         if (belongsTo && belongsTo !== String(it.productId)) {
    //           throw new UserInputError("Variant does not belong to the given product");
    //         }
    //       }
    //     }

    //     // Build items + totals
    //     const items = data.items.map((i) => {
    //       const qty = Number(i.quantity);
    //       const price = Number(i.salePrice);
    //       const lineTotal = Number((qty * price).toFixed(2));

    //       return {
    //         product: i.productId,
    //         variant: i.variantId,
    //         productName: i.productName,
    //         variantName: i.variantName,
    //         sku: i.sku,
    //         quantity: qty,
    //         salePrice: price,
    //         lineTotal,
    //       };
    //     });

    //     const subTotal = Number(items.reduce((s, x) => s + x.lineTotal, 0).toFixed(2));
    //     const taxAmount = Number((data.taxAmount || 0).toFixed(2));
    //     const totalAmount = Number((subTotal + taxAmount).toFixed(2));

    //     const [sale] = await SALE.create(
    //       [
    //         {
    //           seller: data.sellerId,
    //           warehouse: data.warehouseId,
    //           invoiceNo: data.invoiceNo,
    //           customerName: data.customerName,
    //           customerPhone: data.customerPhone,
    //           // courierName: data.courierName,
    //           // trackingNo: data.trackingNo,
    //           // trackingUrl: data.trackingUrl,
    //           address: data.address,
    //           status: data.status,
    //           items,
    //           subTotal,
    //           taxAmount,
    //           totalAmount,
    //           notes: data.notes,
    //           statusTimestamps: { draftAt: new Date() },
    //           statusHistory: [
    //             { status: data.status, at: new Date(), by: ctx?.user?._id, note: "Sale created" },
    //           ],
    //         },
    //       ],
    //       { session }
    //     );

    //     await session.commitTransaction();
    //     session.endSession();
    //     return sale;
    //   } catch (err) {
    //     await session.abortTransaction();
    //     session.endSession();
    //     // duplicate tracking/index etc.
    //     if (err.code === 11000) throw new UserInputError("Duplicate value error");
    //     throw new ApolloError(err.message || "Failed to create sale");
    //   }
    // },
// CreateSale resolver (role-based status + optional-variant + reserve on confirmed)
CreateSale: async (_, { data }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  const isAdminManager = ["ADMIN", "MANAGER"].includes(ctx.user.role);
  const isSellerSales = ["SELLER", "SALES"].includes(ctx.user.role);

  if (!isAdminManager && !isSellerSales) {
    throw new ForbiddenError("Not allowed to create sale");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ---------- Validate seller + warehouse ----------
    if (!mongoose.Types.ObjectId.isValid(data.sellerId)) {
      throw new UserInputError("Invalid sellerId");
    }

    if (!mongoose.Types.ObjectId.isValid(data.projectId)) {
  throw new UserInputError("Invalid projectId");
}

    if (!mongoose.Types.ObjectId.isValid(data.warehouseId)) {
      throw new UserInputError("Invalid warehouseId");
    }

    const seller = await SELLER.findOne({
      _id: data.sellerId,
      isDeleted: { $ne: true },
    }).session(session);
    if (!seller) throw new UserInputError("Seller not found");

    const project = await PROJECT.findOne({
  _id: data.projectId,
  isActive: true,
}).session(session);

if (!project) {
  throw new UserInputError("Project not found or inactive");
}

    const warehouse = await WAREHOUSE.findById(data.warehouseId).session(session);
    if (!warehouse) throw new UserInputError("Warehouse not found");

    if (!data.items || data.items.length === 0) {
      throw new UserInputError("Sale items required");
    }

    // ---------- Collect + validate IDs ----------
    const productIds = [...new Set(data.items.map((i) => i.productId).filter(Boolean))];
    const variantIds = [...new Set(data.items.map((i) => i.variantId).filter(Boolean))];

    const badProducts = productIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (badProducts.length) {
      throw new UserInputError(`Invalid productId(s): ${badProducts.join(", ")}`);
    }

    const badVariants = variantIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (badVariants.length) {
      throw new UserInputError(`Invalid variantId(s): ${badVariants.join(", ")}`);
    }

    // ---------- Ensure products/variants exist ----------
    const [products, variants] = await Promise.all([
      PRODUCT.find({ _id: { $in: productIds } })
        .select("_id name sku")
        .session(session),

      variantIds.length
        ? PRODUCT_VARIANT.find({ _id: { $in: variantIds } })
            .select("_id name sku product")
            .session(session)
        : Promise.resolve([]),
    ]);

    if (products.length !== productIds.length) {
      throw new UserInputError("One or more products not found");
    }

    if (variantIds.length && variants.length !== variantIds.length) {
      throw new UserInputError("One or more variants not found");
    }

    const productMap = new Map(products.map((p) => [String(p._id), p]));
    const variantMap = new Map(variants.map((v) => [String(v._id), v]));

    // ---------- Ensure each variant belongs to its product ----------
    for (const it of data.items) {
      if (it.variantId) {
        const variantDoc = variantMap.get(String(it.variantId));
        if (variantDoc && String(variantDoc.product) !== String(it.productId)) {
          throw new UserInputError("Variant does not belong to the given product");
        }
      }
    }

    // ---------- Fetch warehouse stock for cost snapshot ----------
    const stockQuery = data.items.map((i) => ({
      warehouse: new mongoose.Types.ObjectId(data.warehouseId),
      product: new mongoose.Types.ObjectId(i.productId),
      ...(i.variantId ? { variant: new mongoose.Types.ObjectId(i.variantId) } : { variant: { $in: [null, undefined] } }),
    }));

    const stockDocs = await WAREHOUSE_STOCK.find({
      $or: stockQuery,
    })
      .select("_id warehouse product variant quantity reserved avgCost")
      .session(session);

    const stockMap = new Map(
      stockDocs.map((s) => [
        `${String(s.warehouse)}-${String(s.product)}-${s.variant ? String(s.variant) : "no-variant"}`,
        s,
      ])
    );

    // ---------- Build items ----------
    const items = data.items.map((i, idx) => {
      const qty = Number(i.quantity);
      const price = Number(i.salePrice);

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new UserInputError(`Invalid quantity at item ${idx}`);
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new UserInputError(`Invalid salePrice at item ${idx}`);
      }

      const productDoc = productMap.get(String(i.productId));
      const variantDoc = i.variantId ? variantMap.get(String(i.variantId)) : null;

      const stockKey = `${String(data.warehouseId)}-${String(i.productId)}-${i.variantId ? String(i.variantId) : "no-variant"}`;
      const stockDoc = stockMap.get(stockKey);

      const costPrice = Number(stockDoc?.avgCost || 0);
      const lineCost = Number((qty * costPrice).toFixed(2));
      const lineTotal = Number((qty * price).toFixed(2));

      const doc = {
        product: new mongoose.Types.ObjectId(i.productId),
        productName: i.productName || productDoc?.name || "",
        sku: i.sku || variantDoc?.sku || productDoc?.sku || "",
        quantity: qty,
        salePrice: price,

        // ✅ NEW
        costPrice,
        lineCost,

        lineTotal,
      };

      if (i.variantId) {
        doc.variant = new mongoose.Types.ObjectId(i.variantId);
        doc.variantName = i.variantName || variantDoc?.name || "";
      }

      return doc;
    });

    // ---------- Totals ----------
    const subTotal = Number(items.reduce((s, x) => s + x.lineTotal, 0).toFixed(2));
    const taxAmount = Number((data.taxAmount || 0).toFixed(2));
    const totalAmount = Number((subTotal + taxAmount).toFixed(2));

    // ---------- Payment block ----------
    const paidAmount = Number(data?.payment?.paidAmount ?? 0);
    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new UserInputError("Invalid payment.paidAmount");
    }
    if (paidAmount > totalAmount) {
      throw new UserInputError("payment.paidAmount cannot be greater than totalAmount");
    }

    const balanceAmount = Number((totalAmount - paidAmount).toFixed(2));
    const paymentStatus = balanceAmount <= 0 ? "paid" : "unpaid";

    // ---------- Role-based status ----------
    const now = new Date();
    const status = isAdminManager ? "confirmed" : "draft";

    const statusTimestamps = { draftAt: now };
    if (status === "confirmed") statusTimestamps.confirmedAt = now;

    const statusHistory = [
      { status: "draft", at: now, by: ctx.user._id, note: "Sale created" },
    ];

    if (status === "confirmed") {
      statusHistory.push({
        status: "confirmed",
        at: now,
        by: ctx.user._id,
        note: "Auto-confirmed (created by admin/manager)",
      });
    }

    // ---------- Create sale ----------
    const [sale] = await SALE.create(
      [
        {
          seller: data.sellerId,
          project: data.projectId,
          warehouse: data.warehouseId,
          invoiceNo: data.invoiceNo,
          customerName: data.customerName,
          customerPhone: data.customerPhone,
          country: data.country,
          city: data.city,
          address: data.address,

          status,
          items,
          subTotal,
          taxAmount,
          totalAmount,

          notes: data.notes,
          statusTimestamps,
          statusHistory,

          // ✅ NEW
          payment: {
            status: paymentStatus,
            mode: data?.payment?.mode || "COD",
            bankAccount: data?.payment?.bankAccount,
            paidAmount,
            balanceAmount,
            paidAt: paymentStatus === "paid" ? new Date() : undefined,
          },
        },
      ],
      { session }
    );

    // ---------- Reserve stock if confirmed ----------
    if (sale.status === "confirmed") {
      for (const it of sale.items) {
        await reserveStock(
          {
            warehouseId: sale.warehouse,
            productId: it.product,
            variantId: it.variant,
            qty: it.quantity,
          },
          session
        );
      }
    }

    await session.commitTransaction();
    session.endSession();
    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err?.code === 11000) throw new UserInputError("Duplicate value error");
    throw new ApolloError(err.message || "Failed to create sale");
  }
},

    //   ConfirmSale: async (_, { saleId }, context) => {

    //   const session = await mongoose.startSession();
    //   session.startTransaction();
    //   try {
    //     const sale = await SALE.findById(saleId).session(session);
    //     if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    //     if (sale.status !== "draft") throw new UserInputError("Only draft sale can be confirmed");

    //     // Reserve each item
    //     for (const it of sale.items) {
    //       await reserveStock(
    //         { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
    //         session
    //       );
    //     }

    //     sale.status = "confirmed";
    //     pushHistory(sale, { status: "confirmed", by: context?.user?._id, note: "Sale confirmed (stock reserved)" });

    //     await sale.save({ session });

    //     await session.commitTransaction();
    //     session.endSession();
    //     return sale;
    //   } catch (err) {
    //     await session.abortTransaction();
    //     session.endSession();
    //     throw new ApolloError(err.message || "Failed to confirm sale");
    //   }
    // },


    ConfirmSale: async (_, { saleId }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  // ✅ Only internal roles confirm
  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to confirm sale");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const sale = await SALE.findById(saleId).session(session);
    if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    // ✅ Flow rule: only draft -> confirmed
    if (sale.status !== "draft") {
      throw new UserInputError("Only draft sale can be confirmed");
    }

    if (!sale.items || sale.items.length === 0) {
      throw new UserInputError("Sale has no items");
    }

    // ✅ Reserve each item (variant optional friendly)
    for (const it of sale.items) {
      await reserveStock(
        {
          warehouseId: sale.warehouse,
          productId: it.product,
          variantId: it.variant || undefined,
          qty: it.quantity,
        },
        session
      );
    }

    // ✅ Update status + timestamps + history using your helper(s)
    // if you have updateStatus(sale, ...) use it here.
    // Otherwise do minimal safe updates:
    sale.status = "confirmed";

    if (!sale.statusTimestamps) sale.statusTimestamps = {};
    if (!sale.statusTimestamps.draftAt) sale.statusTimestamps.draftAt = sale.createdAt || new Date();
    sale.statusTimestamps.confirmedAt = new Date();

    // Ensure history exists and contains draft first (in case older docs)
    if (!Array.isArray(sale.statusHistory)) sale.statusHistory = [];
    const hasDraft = sale.statusHistory.some((h) => h.status === "draft");
    if (!hasDraft) {
      sale.statusHistory.push({
        status: "draft",
        at: sale.statusTimestamps.draftAt,
        by: sale.createdBy || ctx.user._id, // fallback
        note: "Auto-added draft history",
      });
    }

    // Use your pushHistory if available
    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "confirmed",
        by: ctx.user._id,
        note: "Sale confirmed (stock reserved)",
      });
    } else {
      sale.statusHistory.push({
        status: "confirmed",
        at: new Date(),
        by: ctx.user._id,
        note: "Sale confirmed (stock reserved)",
      });
    }

    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message || "Failed to confirm sale");
  }
},


    //   MarkOutForDelivery: async (_, { saleId, data }, context) => {
    //   try {
    //     const sale = await SALE.findById(saleId);
    //     if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    //     if (sale.status !== "confirmed") {
    //       throw new UserInputError("Only confirmed sale can be marked out for delivery");
    //     }

    //     if (!data?.courierName?.trim()) throw new UserInputError("courierName is required");
    //     if (!data?.trackingNo?.trim()) throw new UserInputError("trackingNo is required");

    //     sale.courierName = data.courierName.trim();
    //     sale.trackingNo = data.trackingNo.trim();
    //     sale.trackingUrl = data.trackingUrl?.trim();
    //     sale.deliveryNotes = data.deliveryNotes?.trim();
    //     sale.shippedAt = data.shippedAt ? new Date(data.shippedAt) : new Date();

    //     sale.status = "out_for_delivery";
    //     pushHistory(sale, {
    //       status: "out_for_delivery",
    //       by: context?.user?._id,
    //       note: `Courier: ${sale.courierName}, Tracking: ${sale.trackingNo}`,
    //     });

    //     await sale.save();
    //     return sale;
    //   } catch (err) {
    //     if (err.code === 11000) throw new UserInputError("Tracking number already exists");
    //     throw new ApolloError(err.message || "Failed to mark out for delivery");
    //   }
    // },

    MarkOutForDelivery: async (_, { saleId, data }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  // ✅ Only internal roles can move to out_for_delivery
  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to mark out for delivery");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const sale = await SALE.findById(saleId).session(session);
    if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    // ✅ Flow rule: only confirmed -> out_for_delivery
    if (sale.status !== "confirmed") {
      throw new UserInputError("Only confirmed sale can be marked out for delivery");
    }

    // ✅ validate courierId + trackingNo
    if (!data?.courierId || !mongoose.Types.ObjectId.isValid(data.courierId)) {
      throw new UserInputError("Valid courierId is required");
    }
    if (!data?.trackingNo?.trim()) throw new UserInputError("trackingNo is required");

    const courier = await COURIER.findById(data.courierId).session(session);
    if (!courier || courier.isActive === false) {
      throw new UserInputError("Courier not found or inactive");
    }

    const isCOD = data?.isCOD === true;

    // ✅ copy charges snapshot (round to 2 decimals)
    const baseCharge = Number(((courier.charges?.baseCharge ?? 0)).toFixed(2));
    const codCharge = Number((isCOD ? (courier.charges?.codCharge ?? 0) : 0).toFixed(2));
    const returnCharge = Number(((courier.charges?.returnCharge ?? 0)).toFixed(2));

    // ✅ set nested courier block (your new schema)
    sale.courier = {
      courierId: courier._id,
      courierName: courier.name,
      charges: {
        baseCharge,
        codCharge,
        returnCharge,
      },
      trackingNo: data.trackingNo.trim(),
      trackingUrl: data.trackingUrl?.trim(),
    };

    // Optional additional fields (only if you still keep them)
    if (data.deliveryNotes !== undefined) sale.deliveryNotes = data.deliveryNotes?.trim();
    if (data.shippedAt) sale.shippedAt = new Date(data.shippedAt);

    // ✅ status change
    sale.status = "out_for_delivery";

    // ✅ timestamps
    if (!sale.statusTimestamps) sale.statusTimestamps = {};
    if (!sale.statusTimestamps.draftAt) sale.statusTimestamps.draftAt = sale.createdAt || new Date();
    if (!sale.statusTimestamps.confirmedAt) sale.statusTimestamps.confirmedAt = sale.createdAt || new Date();
    if (!sale.statusTimestamps.outForDeliveryAt) sale.statusTimestamps.outForDeliveryAt = new Date();

    // ✅ history
    const note = `Courier assigned: ${courier.name}, Tracking: ${sale.courier.trackingNo}`;
    if (!Array.isArray(sale.statusHistory)) sale.statusHistory = [];
    sale.statusHistory.push({
      status: "out_for_delivery",
      at: new Date(),
      by: ctx.user._id,
      note,
    });

    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err?.code === 11000) throw new UserInputError("Tracking number already exists");
    throw new ApolloError(err.message || "Failed to mark out for delivery");
  }
},


    //   MarkDelivered: async (_, { saleId }, context) => {
    //   const session = await mongoose.startSession();
    //   session.startTransaction();

    //   try {
    //     const sale = await SALE.findById(saleId).session(session);
    //     if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    //     if (!["confirmed", "out_for_delivery"].includes(sale.status)) {
    //       throw new UserInputError("Sale must be confirmed or out_for_delivery to mark delivered");
    //     }

    //     // Optional: require tracking before delivery if you want
    //     // if (!sale.trackingNo) throw new UserInputError("Tracking number missing");

    //     const ledgerDocs = [];

    //     for (const it of sale.items) {
    //       // release reserved now
    //       await releaseReservedStock(
    //         { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
    //         session
    //       );

    //       // FIFO consume physical stock
    //       const usedBatches = await fifoConsume(
    //         { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
    //         session
    //       );

    //       // Ledger OUT per batch
    //       for (const b of usedBatches) {
    //         ledgerDocs.push({
    //           sale: sale._id, // ✅ recommended field in StockLedger
    //           warehouse: sale.warehouse,
    //           product: it.product,
    //           variant: it.variant,

    //           quantityIn: 0,
    //           quantityOut: b.qtyUsed,

    //           batchNo: b.batchNo,
    //           expiryDate: b.expiryDate,

    //           refType: "SALE",
    //           refNo: sale.invoiceNo || String(sale._id),
    //           notes: "Delivered sale (FIFO out)",
    //         });
    //       }
    //     }

    //     if (ledgerDocs.length) await STOCK_LEDGER.insertMany(ledgerDocs, { session });

    //     sale.status = "delivered";
    //     pushHistory(sale, { status: "delivered", by: context?.user?._id, note: "Sale delivered (stock consumed)" });

    //     await sale.save({ session });

    //     await session.commitTransaction();
    //     session.endSession();
    //     return sale;
    //   } catch (err) {
    //     await session.abortTransaction();
    //     session.endSession();
    //     throw new ApolloError(err.message || "Failed to mark delivered");
    //   }
    // },

    MarkDelivered: async (_, { saleId }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  // ✅ Only internal roles should deliver
  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to mark delivered");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const sale = await SALE.findById(saleId).session(session);
    if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    // ✅ Flow rule: delivered only from out_for_delivery
    // (because stock must be reserved on confirmed first)
    if (sale.status !== "out_for_delivery") {
      throw new UserInputError("Only out_for_delivery sale can be marked delivered");
    }

    if (!sale.items || sale.items.length === 0) {
      throw new UserInputError("Sale has no items");
    }

    const ledgerDocs = [];
    const refNo = sale.invoiceNo || String(sale._id);

    for (const it of sale.items) {
      // ✅ 1) Release reserved (variant optional friendly)
      await releaseReservedStock(
        {
          warehouseId: sale.warehouse,
          productId: it.product,
          variantId: it.variant || undefined,
          qty: it.quantity,
        },
        session
      );

      // ✅ 2) Consume physical stock (FIFO) (variant optional friendly)
      const usedBatches = await fifoConsume(
        {
          warehouseId: sale.warehouse,
          productId: it.product,
          variantId: it.variant || undefined,
          qty: it.quantity,
        },
        session
      );

      // ✅ 3) Ledger OUT per batch (variant optional)
      for (const b of usedBatches) {
        const row = {
          sale: sale._id, // if your schema has it
          warehouse: sale.warehouse,
          product: it.product,
          quantityIn: 0,
          quantityOut: b.qtyUsed,
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          refType: "SALE",
          refNo,
          notes: "Delivered sale (FIFO out)",
        };

        if (it.variant) row.variant = it.variant; // ✅ only if exists

        ledgerDocs.push(row);
      }
    }

    if (ledgerDocs.length) {
      await STOCK_LEDGER.insertMany(ledgerDocs, { session });
    }

    // ✅ Update status + timestamps + history (use your pushHistory)
    sale.status = "delivered";

    if (!sale.statusTimestamps) sale.statusTimestamps = {};
    sale.statusTimestamps.deliveredAt = new Date();

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "delivered",
        by: ctx.user._id,
        note: "Sale delivered (reserved released + stock consumed)",
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) sale.statusHistory = [];
      sale.statusHistory.push({
        status: "delivered",
        at: new Date(),
        by: ctx.user._id,
        note: "Sale delivered (reserved released + stock consumed)",
      });
    }

    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message || "Failed to mark delivered");
  }
},



    //   CancelSale: async (_, { saleId }, context) => {
    //   const session = await mongoose.startSession();
    //   session.startTransaction();

    //   try {
    //     const sale = await SALE.findById(saleId).session(session);
    //     if (!sale || sale.isDeleted) return true;

    //     if (sale.status === "delivered") {
    //       throw new UserInputError("Cannot cancel delivered sale. Use ReturnSale.");
    //     }
    //     if (sale.status === "cancelled") return true;

    //     // Release reserved if sale was confirmed/out_for_delivery
    //     if (["confirmed", "out_for_delivery"].includes(sale.status)) {
    //       for (const it of sale.items) {
    //         await releaseReservedStock(
    //           { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
    //           session
    //         );
    //       }
    //     }

    //     sale.status = "cancelled";
    //     pushHistory(sale, { status: "cancelled", by: context?.user?._id, note: "Sale cancelled" });

    //     await sale.save({ session });

    //     await session.commitTransaction();
    //     session.endSession();
    //     return true;
    //   } catch (err) {
    //     await session.abortTransaction();
    //     session.endSession();
    //     throw new ApolloError(err.message || "Failed to cancel sale");
    //   }
    // },

    CancelSale: async (_, { saleId }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  // ✅ Who can cancel? (adjust if you want SELLER allowed for draft only)
  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to cancel sale");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const sale = await SALE.findById(saleId).session(session);
    if (!sale || sale.isDeleted) {
      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // ✅ delivered cannot be cancelled
    if (sale.status === "delivered") {
      throw new UserInputError("Cannot cancel delivered sale. Use ReturnSale.");
    }

    // already cancelled
    if (sale.status === "cancelled") {
      await session.commitTransaction();
      session.endSession();
      return true;
    }

    // ✅ Release reserved only if it was reserved
    // Based on your flow: reserve happens at confirmed
    if (sale.status === "confirmed" || sale.status === "out_for_delivery") {
      if (!sale.items || sale.items.length === 0) {
        throw new UserInputError("Sale has no items");
      }

      for (const it of sale.items) {
        await releaseReservedStock(
          {
            warehouseId: sale.warehouse,
            productId: it.product,
            variantId: it.variant || undefined, // ✅ optional variant friendly
            qty: it.quantity,
          },
          session
        );
      }
    }

    // ✅ Status + timestamps + history
    sale.status = "cancelled";

    if (!sale.statusTimestamps) sale.statusTimestamps = {};
    sale.statusTimestamps.cancelledAt = new Date();

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "cancelled",
        by: ctx.user._id,
        note: "Sale cancelled",
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) sale.statusHistory = [];
      sale.statusHistory.push({
        status: "cancelled",
        at: new Date(),
        by: ctx.user._id,
        note: "Sale cancelled",
      });
    }

    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return true;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message || "Failed to cancel sale");
  }
},



    //   ReturnSale: async (_, { saleId }, context) => {
    //   const session = await mongoose.startSession();
    //   session.startTransaction();

    //   try {
    //     const sale = await SALE.findById(saleId).session(session);
    //     if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    //     if (sale.status !== "delivered") throw new UserInputError("Only delivered sale can be returned");

    //     // Fetch SALE ledger lines for this sale
    //     // Preferred: by sale field (recommended)
    //     let saleOutRows = await STOCK_LEDGER.find({ refType: "SALE", sale: sale._id })
    //       .session(session)
    //       .lean();

    //     // Fallback (if you didn't add sale field)
    //     if (!saleOutRows.length) {
    //       const refNo = sale.invoiceNo || String(sale._id);
    //       saleOutRows = await StockLedger.find({ refType: "SALE", refNo }).session(session).lean();
    //     }

    //     if (!saleOutRows.length) throw new UserInputError("Sale ledger not found. Cannot return safely.");

    //     const returnLedgerDocs = [];
    //     const returnRef = `RET-${sale.invoiceNo || String(sale._id)}`;

    //     for (const row of saleOutRows) {
    //       const qty = Number(row.quantityOut || 0);
    //       if (!qty) continue;

    //       await addBackToBatch(
    //         {
    //           warehouseId: row.warehouse,
    //           productId: row.product,
    //           variantId: row.variant,
    //           qty,
    //           batchNo: row.batchNo,
    //           expiryDate: row.expiryDate,
    //         },
    //         session
    //       );

    //       returnLedgerDocs.push({
    //         sale: sale._id,
    //         warehouse: row.warehouse,
    //         product: row.product,
    //         variant: row.variant,

    //         quantityIn: qty,
    //         quantityOut: 0,

    //         batchNo: row.batchNo,
    //         expiryDate: row.expiryDate,

    //         refType: "SALE_RETURN",
    //         refNo: returnRef,
    //         notes: "Return against delivered sale",
    //       });
    //     }

    //     if (returnLedgerDocs.length) await STOCK_LEDGER.insertMany(returnLedgerDocs, { session });

    //     sale.status = "returned";
    //     pushHistory(sale, { status: "returned", by: context?.user?._id, note: "Sale returned (stock added back)" });

    //     await sale.save({ session });

    //     await session.commitTransaction();
    //     session.endSession();
    //     return sale;
    //   } catch (err) {
    //     await session.abortTransaction();
    //     session.endSession();
    //     throw new ApolloError(err.message || "Failed to return sale");
    //   }
    // },
    ReturnSale: async (_, { saleId }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  // ✅ Only internal roles should process returns
  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to return sale");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const sale = await SALE.findById(saleId).session(session);
    if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    // ✅ Flow rule: only delivered -> returned
    if (sale.status !== "delivered") {
      throw new UserInputError("Only delivered sale can be returned");
    }

    // ✅ Fetch SALE ledger rows (best: by sale field)
    let saleOutRows = await STOCK_LEDGER.find({ refType: "SALE", sale: sale._id })
      .session(session)
      .lean();

    // fallback: by refNo
    if (!saleOutRows.length) {
      const refNo = sale.invoiceNo || String(sale._id);
      saleOutRows = await STOCK_LEDGER.find({ refType: "SALE", refNo }).session(session).lean();
    }

    if (!saleOutRows.length) {
      throw new UserInputError("Sale ledger not found. Cannot return safely.");
    }

    const returnLedgerDocs = [];
    const returnRef = `RET-${sale.invoiceNo || String(sale._id)}`;

    for (const row of saleOutRows) {
      const qty = Number(row.quantityOut || 0);
      if (!qty) continue;

      // ✅ Add stock back to the SAME batch consumed during delivery
      await addBackToBatch(
        {
          warehouseId: row.warehouse,
          productId: row.product,
          variantId: row.variant || undefined, // ✅ optional variant friendly
          qty,
          batchNo: row.batchNo,
          expiryDate: row.expiryDate,
        },
        session
      );

      // ✅ Return ledger entry (variant optional)
      const entry = {
        sale: sale._id,
        warehouse: row.warehouse,
        product: row.product,
        quantityIn: qty,
        quantityOut: 0,
        batchNo: row.batchNo,
        expiryDate: row.expiryDate,
        refType: "SALE_RETURN",
        refNo: returnRef,
        notes: "Return against delivered sale",
      };

      if (row.variant) entry.variant = row.variant; // ✅ only if exists

      returnLedgerDocs.push(entry);
    }

    if (returnLedgerDocs.length) {
      await STOCK_LEDGER.insertMany(returnLedgerDocs, { session });
    }

    // ✅ Update status + timestamps + history
    sale.status = "returned";

    if (!sale.statusTimestamps) sale.statusTimestamps = {};
    sale.statusTimestamps.returnedAt = new Date();

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "returned",
        by: ctx.user._id,
        note: "Sale returned (stock added back)",
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) sale.statusHistory = [];
      sale.statusHistory.push({
        status: "returned",
        at: new Date(),
        by: ctx.user._id,
        note: "Sale returned (stock added back)",
      });
    }

    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message || "Failed to return sale");
  }
},


MarkSalePaid: async (_, { saleId, payment }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  // ✅ only internal roles can mark paid (you can change this)
  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to mark sale paid");
  }

  if (!mongoose.Types.ObjectId.isValid(saleId)) {
    throw new UserInputError("Invalid saleId");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const sale = await SALE.findById(saleId).session(session);
    if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

    const mode = (payment?.mode || sale.payment?.mode || "COD").toUpperCase();

    if (!["COD", "ONLINE"].includes(mode)) {
      throw new UserInputError("payment.mode must be COD or ONLINE");
    }

    // ✅ If ONLINE paid => bankAccount required
    const bankAccount = payment?.bankAccount?.trim();
    if (mode === "ONLINE" && !bankAccount) {
      throw new UserInputError("bankAccount is required for ONLINE payment");
    }

    // ✅ mark paid
    sale.payment = {
      status: "paid",
      mode,
      bankAccount: mode === "ONLINE" ? bankAccount : undefined,
      paidAt: new Date(),
    };

    // ✅ keep history
    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: sale.status,
        by: ctx.user._id,
        note: `Payment marked PAID (${mode}${mode === "ONLINE" ? ` - ${bankAccount}` : ""})`,
      });
    }

    await sale.save({ session });

    await session.commitTransaction();
    session.endSession();
    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message || "Failed to mark sale paid");
  }
},




  },
};

 export default saleResolvers 
