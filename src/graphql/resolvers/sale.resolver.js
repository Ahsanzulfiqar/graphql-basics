import mongoose from "mongoose";
import { ApolloError, UserInputError,AuthenticationError,ForbiddenError } from "apollo-server-express";
import SALE from "../../models/Sale.js";
import USER from "../../models/User.js";
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
import {
  postSaleRevenueVoucher,
  postSalePaymentVoucher,
} from "../../services/accounting.helpers.js";




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

    AdminSalesDashboard: async (_, { filter = {} }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  if (!["ADMIN", "MANAGER"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed");
  }

  const match = {
    isDeleted: { $ne: true },
  };

  if (filter.projectId) match.project = new mongoose.Types.ObjectId(filter.projectId);
  if (filter.sellerId) match.seller = new mongoose.Types.ObjectId(filter.sellerId);
  if (filter.warehouseId) match.warehouse = new mongoose.Types.ObjectId(filter.warehouseId);
  if (filter.courierId) match["courier.courierId"] = new mongoose.Types.ObjectId(filter.courierId);
  if (filter.status) match.status = filter.status;
  if (filter.paymentStatus) match["payment.status"] = filter.paymentStatus;
  if (filter.paymentMode) match["payment.mode"] = filter.paymentMode;
  if (filter.country) match.country = filter.country;
  if (filter.city) match.city = filter.city;

  if (filter.dateFrom || filter.dateTo) {
    match.createdAt = {};

    if (filter.dateFrom) {
      match.createdAt.$gte = new Date(filter.dateFrom);
    }

    if (filter.dateTo) {
      const end = new Date(filter.dateTo);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
  }

  const [
    summary,
    statusBreakdown,
    topSellers,
    topProjects,
    topProducts,
    salesTrend,
  ] = await Promise.all([
    SALE.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          totalCost: { $sum: "$totalCost" },
          netProfit: { $sum: "$grossProfit" },
          paidAmount: { $sum: "$payment.paidAmount" },
          balanceAmount: { $sum: "$payment.balanceAmount" },
          codPending: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$payment.mode", "COD"] },
                    { $ne: ["$payment.status", "paid"] },
                  ],
                },
                "$payment.balanceAmount",
                0,
              ],
            },
          },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          returnedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "returned"] }, 1, 0] },
          },
          pendingOrders: {
            $sum: {
              $cond: [
                { $in: ["$status", ["draft", "confirmed", "out_for_delivery"]] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),

    SALE.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      {
        $project: {
          status: "$_id",
          orders: 1,
          revenue: 1,
          _id: 0,
        },
      },
    ]),

    SALE.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$seller",
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
          profit: { $sum: "$grossProfit" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "sellerData",
        },
      },
      {
        $project: {
          seller: "$_id",
          sellerName: { $ifNull: [{ $arrayElemAt: ["$sellerData.name", 0] }, "N/A"] },
          revenue: 1,
          orders: 1,
          profit: 1,
          _id: 0,
        },
      },
    ]),

    SALE.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$project",
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
          profit: { $sum: "$grossProfit" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "projects",
          localField: "_id",
          foreignField: "_id",
          as: "projectData",
        },
      },
      {
        $project: {
          project: "$_id",
          projectName: { $ifNull: [{ $arrayElemAt: ["$projectData.name", 0] }, "N/A"] },
          revenue: 1,
          orders: 1,
          profit: 1,
          _id: 0,
        },
      },
    ]),

    SALE.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          productName: { $first: "$items.productName" },
          sku: { $first: "$items.sku" },
          quantity: { $sum: "$items.quantity" },
          revenue: { $sum: "$items.lineTotal" },
          cost: { $sum: "$items.lineCost" },
        },
      },
      {
        $project: {
          product: "$_id",
          productName: 1,
          sku: 1,
          quantity: 1,
          revenue: 1,
          profit: { $subtract: ["$revenue", "$cost"] },
          _id: 0,
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ]),

    SALE.aggregate([
      { $match: match },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$createdAt",
            },
          },
          revenue: { $sum: "$totalAmount" },
          orders: { $sum: 1 },
        },
      },
      {
        $project: {
          date: "$_id",
          revenue: 1,
          orders: 1,
          _id: 0,
        },
      },
      { $sort: { date: 1 } },
    ]),
  ]);

  const s = summary[0] || {};

  const totalOrders = s.totalOrders || 0;
  const deliveredOrders = s.deliveredOrders || 0;
  const returnedOrders = s.returnedOrders || 0;
  const cancelledOrders = s.cancelledOrders || 0;

  return {
    totalRevenue: Number((s.totalRevenue || 0).toFixed(2)),
    netProfit: Number((s.netProfit || 0).toFixed(2)),
    totalOrders,
    pendingOrders: s.pendingOrders || 0,
    deliveredOrders,
    cancelledOrders,
    returnedOrders,
    paidAmount: Number((s.paidAmount || 0).toFixed(2)),
    balanceAmount: Number((s.balanceAmount || 0).toFixed(2)),
    codPending: Number((s.codPending || 0).toFixed(2)),
    averageOrderValue: deliveredOrders
      ? Number(((s.totalRevenue || 0) / deliveredOrders).toFixed(2))
      : 0,
    deliveryRate: totalOrders
      ? Number(((deliveredOrders / totalOrders) * 100).toFixed(2))
      : 0,
    returnRate: deliveredOrders
      ? Number(((returnedOrders / deliveredOrders) * 100).toFixed(2))
      : 0,
    cancellationRate: totalOrders
      ? Number(((cancelledOrders / totalOrders) * 100).toFixed(2))
      : 0,
    topSellers,
    topProjects,
    topProducts,
    salesTrend,
    statusBreakdown,
  };
},

  },

  Mutation: {


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
    if (!mongoose.Types.ObjectId.isValid(data.projectId)) {
      throw new UserInputError("Invalid projectId");
    }

    if (!mongoose.Types.ObjectId.isValid(data.sellerId)) {
      throw new UserInputError("Invalid sellerId");
    }

    if (!mongoose.Types.ObjectId.isValid(data.warehouseId)) {
      throw new UserInputError("Invalid warehouseId");
    }

    const seller = await USER.findOne({
      _id: data.sellerId,
      isActive: { $ne: false },
      role: { $in: ["SELLER", "SALES"] },
    }).session(session);

    if (!seller) {
      throw new UserInputError("Seller user not found or inactive");
    }

    const project = await PROJECT.findOne({
      _id: data.projectId,
      isActive: true,
    }).session(session);

    if (!project) {
      throw new UserInputError("Project not found or inactive");
    }

    const warehouse = await WAREHOUSE.findById(data.warehouseId).session(session);

    if (!warehouse) {
      throw new UserInputError("Warehouse not found");
    }

    const warehouseAllowed = (project.warehouses || []).some(
      (id) => String(id) === String(data.warehouseId)
    );

    if (!warehouseAllowed) {
      throw new UserInputError("Warehouse not allowed in this project");
    }

    const sellerAllowed =
      String(project.seller || "") === String(data.sellerId) ||
      (project.sellers || []).some(
        (id) => id && String(id) === String(data.sellerId)
      );

    if (!sellerAllowed) {
      throw new UserInputError("Seller not allowed in this project");
    }

    if (!data.items || data.items.length === 0) {
      throw new UserInputError("Sale items required");
    }

    const productIds = [
      ...new Set(data.items.map((i) => i.productId).filter(Boolean)),
    ];

    const variantIds = [
      ...new Set(data.items.map((i) => i.variantId).filter(Boolean)),
    ];

    const badProducts = productIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (badProducts.length) {
      throw new UserInputError(`Invalid productId(s): ${badProducts.join(", ")}`);
    }

    const badVariants = variantIds.filter(
      (id) => !mongoose.Types.ObjectId.isValid(id)
    );

    if (badVariants.length) {
      throw new UserInputError(`Invalid variantId(s): ${badVariants.join(", ")}`);
    }

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

    for (const it of data.items) {
      if (it.variantId) {
        const variantDoc = variantMap.get(String(it.variantId));

        if (!variantDoc) {
          throw new UserInputError("Variant not found");
        }

        if (String(variantDoc.product) !== String(it.productId)) {
          throw new UserInputError("Variant does not belong to the given product");
        }
      }
    }

    const stockQuery = data.items.map((i) => ({
      warehouse: new mongoose.Types.ObjectId(data.warehouseId),
      product: new mongoose.Types.ObjectId(i.productId),
      ...(i.variantId
        ? { variant: new mongoose.Types.ObjectId(i.variantId) }
        : { variant: { $in: [null, undefined] } }),
    }));

    const stockDocs = await WAREHOUSE_STOCK.find({ $or: stockQuery })
      .select("_id warehouse product variant quantity reserved avgCost")
      .session(session);

    const stockMap = new Map(
      stockDocs.map((s) => [
        `${String(s.warehouse)}-${String(s.product)}-${
          s.variant ? String(s.variant) : "no-variant"
        }`,
        s,
      ])
    );

    const items = data.items.map((i, idx) => {
      const qty = Number(i.quantity);
      const price = Number(i.salePrice);

      if (!Number.isFinite(qty) || qty <= 0) {
        throw new UserInputError(`Invalid quantity at item ${idx + 1}`);
      }

      if (!Number.isFinite(price) || price < 0) {
        throw new UserInputError(`Invalid salePrice at item ${idx + 1}`);
      }

      const productDoc = productMap.get(String(i.productId));
      const variantDoc = i.variantId ? variantMap.get(String(i.variantId)) : null;

      const stockKey = `${String(data.warehouseId)}-${String(i.productId)}-${
        i.variantId ? String(i.variantId) : "no-variant"
      }`;

      const stockDoc = stockMap.get(stockKey);

      const costPrice = Number(stockDoc?.avgCost || 0);
      const lineCost = Number((qty * costPrice).toFixed(2));
      const lineTotal = Number((qty * price).toFixed(2));

      const itemDoc = {
        product: new mongoose.Types.ObjectId(i.productId),
        productName: i.productName || productDoc?.name || "",
        sku: i.sku || variantDoc?.sku || productDoc?.sku || "",
        quantity: qty,
        salePrice: price,
        costPrice,
        lineCost,
        lineTotal,
      };

      if (i.variantId) {
        itemDoc.variant = new mongoose.Types.ObjectId(i.variantId);
        itemDoc.variantName = i.variantName || variantDoc?.name || "";
      }

      return itemDoc;
    });

    const subTotal = Number(
      items.reduce((sum, item) => sum + item.lineTotal, 0).toFixed(2)
    );

    const taxAmount = Number((data.taxAmount || 0).toFixed(2));

    if (!Number.isFinite(taxAmount) || taxAmount < 0) {
      throw new UserInputError("Invalid taxAmount");
    }

    const totalAmount = Number((subTotal + taxAmount).toFixed(2));

    const totalCost = Number(
      items.reduce((sum, item) => sum + Number(item.lineCost || 0), 0).toFixed(2)
    );

    const grossProfit = Number((subTotal - totalCost).toFixed(2));

    const paidAmount = Number(data?.payment?.paidAmount ?? 0);

    if (!Number.isFinite(paidAmount) || paidAmount < 0) {
      throw new UserInputError("Invalid payment.paidAmount");
    }

    if (paidAmount > totalAmount) {
      throw new UserInputError(
        "payment.paidAmount cannot be greater than totalAmount"
      );
    }

    const paymentMode = (data?.payment?.mode || "COD").toUpperCase();

    if (!["COD", "ONLINE"].includes(paymentMode)) {
      throw new UserInputError("payment.mode must be COD or ONLINE");
    }

    if (paymentMode === "ONLINE" && paidAmount > 0) {
      if (!data?.payment?.bankAccount?.trim()) {
        throw new UserInputError("bankAccount is required for ONLINE payment");
      }
    }

    const balanceAmount = Number((totalAmount - paidAmount).toFixed(2));

    let paymentStatus = "unpaid";

    if (paidAmount > 0 && paidAmount < totalAmount) {
      paymentStatus = "partial";
    } else if (paidAmount === totalAmount) {
      paymentStatus = "paid";
    }

    const now = new Date();
    const status = isAdminManager ? "confirmed" : "draft";

    const statusTimestamps = {
      draftAt: now,
    };

    if (status === "confirmed") {
      statusTimestamps.confirmedAt = now;
    }

    const statusHistory = [
      {
        status: "draft",
        at: now,
        by: ctx.user._id,
        note: "Sale created",
      },
    ];

    if (status === "confirmed") {
      statusHistory.push({
        status: "confirmed",
        at: now,
        by: ctx.user._id,
        note: "Auto-confirmed by admin/manager",
      });
    }

    const [sale] = await SALE.create(
      [
        {
          project: data.projectId,
          seller: data.sellerId,
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
          totalCost,
          grossProfit,

          notes: data.notes,
          statusTimestamps,
          statusHistory,

          createdBy: ctx.user._id,
          updatedBy: ctx.user._id,

          payment: {
            status: paymentStatus,
            mode: paymentMode,
            bankAccount:
              paymentMode === "ONLINE"
                ? data.payment.bankAccount.trim()
                : undefined,
            paidAmount,
            balanceAmount,
            paidAt: paymentStatus === "paid" ? now : undefined,
          },
        },
      ],
      { session }
    );

    if (sale.status === "confirmed") {
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
    }

    await session.commitTransaction();
    session.endSession();

    return sale;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (err?.code === 11000) {
      throw new UserInputError("Duplicate invoiceNo or tracking number");
    }

    if (
      err instanceof UserInputError ||
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError
    ) {
      throw err;
    }

    throw new ApolloError(err.message || "Failed to create sale");
  }
},
  

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
sale.updatedBy = ctx.user.id;
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
    user: ctx.user,
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


it.batches = usedBatches.map((b) => ({
  batchNo: b.batchNo,
  expiryDate: b.expiryDate,
  quantity: Number(b.qtyUsed || 0),
  costPrice: Number(it.costPrice || 0),
  lineCost: Number(
    (Number(b.qtyUsed || 0) * Number(it.costPrice || 0)).toFixed(2)
  ),
}));

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
if (!sale.accounting?.salesPosted) {

 
  const voucher = await postSaleRevenueVoucher(sale, ctx.user, session);

  sale.accounting = sale.accounting || {};
  sale.accounting.salesPosted = true;
  sale.accounting.salesVoucher = voucher._id;
}
sale.updatedBy = ctx.user.id;
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
    variantId: it.variant || undefined,
    qty: it.quantity,
    user: ctx.user,
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

    if (["cancelled", "returned"].includes(sale.status)) {
      throw new UserInputError("Cannot mark cancelled or returned sale as paid");
    }

    const mode = (payment?.mode || sale.payment?.mode || "COD").toUpperCase();

    if (!["COD", "ONLINE"].includes(mode)) {
      throw new UserInputError("payment.mode must be COD or ONLINE");
    }

    const bankAccount = payment?.bankAccount?.trim();

    if (mode === "ONLINE" && !bankAccount) {
      throw new UserInputError("bankAccount is required for ONLINE payment");
    }

    const totalAmount = Number(sale.totalAmount || 0);

    sale.payment = {
      ...(sale.payment?.toObject?.() || sale.payment || {}),
      status: "paid",
      mode,
      bankAccount: mode === "ONLINE" ? bankAccount : undefined,
      paidAmount: totalAmount,
      balanceAmount: 0,
      paidAt: new Date(),
    };

    pushHistory(sale, {
      status: sale.status,
      by: ctx.user._id,
      note: `Payment marked PAID (${mode}${mode === "ONLINE" ? ` - ${bankAccount}` : ""})`,
    });

    if (!sale.accounting?.paymentPosted) {

  const voucher = await postSalePaymentVoucher(
  sale,
  mode,
  ctx,
  session
);

  sale.accounting = sale.accounting || {};
  sale.accounting.paymentPosted = true;
  sale.accounting.paymentVoucher = voucher._id;
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
