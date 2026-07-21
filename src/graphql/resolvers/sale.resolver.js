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
   postSaleCOGSVoucher,
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

    if (!sale || sale.isDeleted) {
      throw new UserInputError("Sale not found");
    }

    if (sale.status !== "out_for_delivery") {
      throw new UserInputError(
        "Only out_for_delivery sale can be marked delivered"
      );
    }

    if (!sale.items || sale.items.length === 0) {
      throw new UserInputError("Sale has no items");
    }

    const ledgerDocs = [];
    const refNo = sale.invoiceNo || String(sale._id);

    for (const it of sale.items) {
      const qty = Number(it.quantity || 0);

      if (qty <= 0) {
        throw new UserInputError("Sale item quantity must be greater than 0");
      }

      await releaseReservedStock(
        {
          warehouseId: sale.warehouse,
          productId: it.product,
          variantId: it.variant || undefined,
          qty,
          user: ctx.user,
        },
        session
      );

      const usedBatches = await fifoConsume(
        {
          warehouseId: sale.warehouse,
          productId: it.product,
          variantId: it.variant || undefined,
          qty,
        },
        session
      );

      if (!usedBatches || usedBatches.length === 0) {
        throw new UserInputError("FIFO stock consumption failed");
      }

      it.batches = usedBatches.map((b) => {
        const qtyUsed = Number(b.qtyUsed || 0);

        const costPrice = Number(
          b.costPrice ||
            b.avgCost ||
            b.unitCost ||
            it.costPrice ||
            0
        );

        const lineCost = Number((qtyUsed * costPrice).toFixed(2));

        return {
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          quantity: qtyUsed,
          costPrice,
          lineCost,
        };
      });

      const itemLineCost = Number(
        it.batches
          .reduce((sum, batch) => sum + Number(batch.lineCost || 0), 0)
          .toFixed(2)
      );

      if (itemLineCost <= 0) {
        throw new UserInputError(
          "Sale item cost is missing. Cannot post COGS voucher."
        );
      }

      it.lineCost = itemLineCost;
      it.costPrice = Number((itemLineCost / qty).toFixed(2));

      for (const b of usedBatches) {
        const row = {
          sale: sale._id,
          warehouse: sale.warehouse,
          product: it.product,
          quantityIn: 0,
          quantityOut: Number(b.qtyUsed || 0),
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          refType: "SALE",
          refNo,
          notes: "Delivered sale (FIFO out)",
        };

        if (it.variant) {
          row.variant = it.variant;
        }

        ledgerDocs.push(row);
      }
    }

    if (ledgerDocs.length) {
      await STOCK_LEDGER.insertMany(ledgerDocs, { session });
    }

    const totalCost = Number(
      sale.items
        .reduce((sum, item) => sum + Number(item.lineCost || 0), 0)
        .toFixed(2)
    );

    if (totalCost <= 0) {
      throw new UserInputError(
        "Sale delivered but total cost is missing. Cannot post COGS voucher."
      );
    }

    sale.totalCost = totalCost;
    sale.grossProfit = Number(
      (Number(sale.totalAmount || 0) - totalCost).toFixed(2)
    );

    sale.status = "delivered";

    if (!sale.statusTimestamps) {
      sale.statusTimestamps = {};
    }

    sale.statusTimestamps.deliveredAt = new Date();

    if (!sale.accounting) {
      sale.accounting = {};
    }

    if (!sale.accounting.salesPosted) {
      const salesVoucher = await postSaleRevenueVoucher(
        sale,
        ctx.user,
        session
      );

      sale.accounting.salesPosted = true;
      sale.accounting.salesVoucher = salesVoucher._id;
    }

    if (!sale.accounting.cogsPosted) {
      const cogsVoucher = await postSaleCOGSVoucher(
        sale,
        ctx.user,
        session
      );

      sale.accounting.cogsPosted = true;
      sale.accounting.cogsVoucher = cogsVoucher._id;
    }

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "delivered",
        by: ctx.user._id || ctx.user.id,
        note: "Sale delivered (reserved released + stock consumed)",
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) {
        sale.statusHistory = [];
      }

      sale.statusHistory.push({
        status: "delivered",
        at: new Date(),
        by: ctx.user._id || ctx.user.id,
        note: "Sale delivered (reserved released + stock consumed)",
      });
    }

    sale.updatedBy = ctx.user._id || ctx.user.id;

    await sale.save({ session });

    await session.commitTransaction();

    return sale;
  } catch (err) {
    await session.abortTransaction();

    console.error("❌ MarkDelivered Error:", {
      message: err.message,
      saleId,
      userId: ctx.user?._id || ctx.user?.id,
      stack: err.stack,
    });

    if (
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError ||
      err instanceof UserInputError
    ) {
      throw err;
    }

    throw new ApolloError(
      err.message || "Failed to mark delivered",
      "MARK_DELIVERED_FAILED"
    );
  } finally {
    session.endSession();
  }
},



CancelSale: async (_, { saleId, cancelReason }, ctx) => {
  if (!ctx.user) {
    throw new AuthenticationError("Login required");
  }

  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to cancel sale");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const cleanCancelReason = cancelReason?.trim();

    if (!cleanCancelReason) {
      throw new UserInputError("Cancel reason is required");
    }

    const sale = await SALE.findById(saleId).session(session);

    if (!sale || sale.isDeleted) {
      await session.commitTransaction();
      return true;
    }

    if (sale.status === "delivered") {
      throw new UserInputError(
        "Cannot cancel delivered sale. Use ReturnSale."
      );
    }

    if (sale.status === "returned") {
      throw new UserInputError("Returned sale cannot be cancelled");
    }

    if (sale.status === "cancelled") {
      await session.commitTransaction();
      return true;
    }

    /*
     * Reserved stock exists only after confirmation.
     * Release it for confirmed and out_for_delivery sales.
     */
    if (
      sale.status === "confirmed" ||
      sale.status === "out_for_delivery"
    ) {
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
          },
          session
        );
      }
    }

    const cancelledAt = new Date();

    sale.status = "cancelled";
    sale.cancelReason = cleanCancelReason;

    if (!sale.statusTimestamps) {
      sale.statusTimestamps = {};
    }

    sale.statusTimestamps.cancelledAt = cancelledAt;

    const historyNote =
      `Sale cancelled. Reason: ${cleanCancelReason}`;

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "cancelled",
        by: ctx.user._id,
        note: historyNote,
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) {
        sale.statusHistory = [];
      }

      sale.statusHistory.push({
        status: "cancelled",
        at: cancelledAt,
        by: ctx.user._id,
        note: historyNote,
      });
    }

    await sale.save({ session });

    await session.commitTransaction();

    return true;
  } catch (err) {
    await session.abortTransaction();

    throw new ApolloError(
      err.message || "Failed to cancel sale"
    );
  } finally {
    session.endSession();
  }
},


ReturnSale: async (_, { saleId, returnReason }, ctx) => {
  if (!ctx.user) {
    throw new AuthenticationError("Login required");
  }

  if (!["ADMIN", "MANAGER", "SALES"].includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed to return sale");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    const cleanReturnReason = returnReason?.trim();

    if (!cleanReturnReason) {
      throw new UserInputError("Return reason is required");
    }

    const sale = await SALE.findById(saleId).session(session);

    if (!sale || sale.isDeleted) {
      throw new UserInputError("Sale not found");
    }

    // Only delivered sales can be returned
    if (sale.status !== "delivered") {
      throw new UserInputError(
        "Only delivered sale can be returned"
      );
    }

    /*
     * Fetch the stock ledger entries created when
     * this sale was delivered.
     */
    let saleOutRows = await STOCK_LEDGER.find({
      refType: "SALE",
      sale: sale._id,
      quantityOut: { $gt: 0 },
    })
      .session(session)
      .lean();

    // Fallback for older ledger records
    if (!saleOutRows.length) {
      const refNo = sale.invoiceNo || String(sale._id);

      saleOutRows = await STOCK_LEDGER.find({
        refType: "SALE",
        refNo,
        quantityOut: { $gt: 0 },
      })
        .session(session)
        .lean();
    }

    if (!saleOutRows.length) {
      throw new UserInputError(
        "Sale ledger not found. Cannot return safely."
      );
    }

    /*
     * Prevent stock from being returned twice.
     */
    const existingReturn = await STOCK_LEDGER.findOne({
      refType: "SALE_RETURN",
      sale: sale._id,
    }).session(session);

    if (existingReturn) {
      throw new UserInputError(
        "This sale stock has already been returned"
      );
    }

    const returnLedgerDocs = [];

    const returnRef = `RET-${
      sale.invoiceNo || String(sale._id)
    }`;

    for (const row of saleOutRows) {
      const qty = Number(row.quantityOut || 0);

      if (qty <= 0) continue;

      // Add stock back to the same batch consumed on delivery
      await addBackToBatch(
        {
          warehouseId: row.warehouse,
          productId: row.product,
          variantId: row.variant || undefined,
          qty,
          batchNo: row.batchNo,
          expiryDate: row.expiryDate,
        },
        session
      );

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

        notes: `Sale returned. Reason: ${cleanReturnReason}`,
      };

      if (row.variant) {
        entry.variant = row.variant;
      }

      returnLedgerDocs.push(entry);
    }

    if (!returnLedgerDocs.length) {
      throw new UserInputError(
        "No stock quantity found to return"
      );
    }

    await STOCK_LEDGER.insertMany(returnLedgerDocs, {
      session,
    });

    const returnedAt = new Date();

    // Update sale
    sale.status = "returned";
    sale.returnReason = cleanReturnReason;

    if (!sale.statusTimestamps) {
      sale.statusTimestamps = {};
    }

    sale.statusTimestamps.returnedAt = returnedAt;

    const historyNote =
      `Sale returned and stock added back. ` +
      `Reason: ${cleanReturnReason}`;

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: "returned",
        by: ctx.user._id,
        note: historyNote,
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) {
        sale.statusHistory = [];
      }

      sale.statusHistory.push({
        status: "returned",
        at: returnedAt,
        by: ctx.user._id,
        note: historyNote,
      });
    }

    await sale.save({ session });

    await session.commitTransaction();

    return sale;
  } catch (err) {
    await session.abortTransaction();

    throw new ApolloError(
      err.message || "Failed to return sale"
    );
  } finally {
    session.endSession();
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

UpdateSale: async (_, { saleId, data }, ctx) => {
  if (!ctx.user) {
    throw new AuthenticationError("Login required");
  }

  const role = ctx.user.role;

  if (!["ADMIN", "MANAGER", "SALES", "SELLER"].includes(role)) {
    throw new ForbiddenError("Not allowed to update sale");
  }

  const isAdminOrManager = ["ADMIN", "MANAGER"].includes(role);
  const isSellerOrSales = ["SELLER", "SALES"].includes(role);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!mongoose.Types.ObjectId.isValid(saleId)) {
      throw new UserInputError("Invalid saleId");
    }

    if (!data || Object.keys(data).length === 0) {
      throw new UserInputError("Update data is required");
    }

    const sale = await SALE.findById(saleId).session(session);

    if (!sale || sale.isDeleted) {
      throw new UserInputError("Sale not found");
    }

    /*
     * Status based protection
     */
    if (["delivered", "cancelled", "returned"].includes(sale.status)) {
      throw new UserInputError(
        `${sale.status} sale cannot be updated`
      );
    }

    /*
     * SELLER / SALES can update only draft sale
     */
    if (isSellerOrSales && !isAdminOrManager) {
      if (sale.status !== "draft") {
        throw new ForbiddenError(
          "Seller can update only draft sale"
        );
      }

      /*
       * Seller/Sales can update only his own sale
       */
      if (
        sale.seller &&
        String(sale.seller) !== String(ctx.user._id)
      ) {
        throw new ForbiddenError(
          "You can update only your own sale"
        );
      }
    }

    /*
     * Confirmed sale can be updated only by Admin / Manager
     */
    if (sale.status === "confirmed" && !isAdminOrManager) {
      throw new ForbiddenError(
        "Only Admin or Manager can update confirmed sale"
      );
    }

    /*
     * Confirmed sale inventory fields are locked.
     * Because confirmed sale already has reserved stock.
     */
    if (sale.status === "confirmed") {
      const blockedFields = [];

      if (data.items !== undefined) blockedFields.push("items");
      if (data.warehouseId !== undefined) blockedFields.push("warehouseId");
      if (data.projectId !== undefined) blockedFields.push("projectId");
      if (data.sellerId !== undefined) blockedFields.push("sellerId");

      if (blockedFields.length) {
        throw new UserInputError(
          `Cannot update ${blockedFields.join(
            ", "
          )} after sale is confirmed. Cancel sale or move it back to draft first.`
        );
      }
    }

    /*
     * Draft sale full validations
     */
    if (sale.status === "draft") {
      const nextProjectId = data.projectId || sale.project;
      const nextSellerId = data.sellerId || sale.seller;
      const nextWarehouseId = data.warehouseId || sale.warehouse;

      if (!nextProjectId) {
        throw new UserInputError("Project is required");
      }

      if (!nextSellerId) {
        throw new UserInputError("Seller is required");
      }

      if (!nextWarehouseId) {
        throw new UserInputError("Warehouse is required");
      }

      if (!mongoose.Types.ObjectId.isValid(nextProjectId)) {
        throw new UserInputError("Invalid projectId");
      }

      if (!mongoose.Types.ObjectId.isValid(nextSellerId)) {
        throw new UserInputError("Invalid sellerId");
      }

      if (!mongoose.Types.ObjectId.isValid(nextWarehouseId)) {
        throw new UserInputError("Invalid warehouseId");
      }

      const project = await PROJECT.findOne({
        _id: nextProjectId,
        isActive: true,
      }).session(session);

      if (!project) {
        throw new UserInputError("Project not found or inactive");
      }

      const seller = await USER.findOne({
        _id: nextSellerId,
        role: { $in: ["SELLER", "SALES"] },
        isDeleted: { $ne: true },
      }).session(session);

      if (!seller) {
        throw new UserInputError("Seller not found");
      }

      const warehouse = await WAREHOUSE.findOne({
        _id: nextWarehouseId,
        isDeleted: { $ne: true },
      }).session(session);

      if (!warehouse) {
        throw new UserInputError("Warehouse not found");
      }

      /*
       * Project warehouse validation
       */
      if (
        Array.isArray(project.warehouses) &&
        project.warehouses.length > 0
      ) {
        const warehouseAllowed = project.warehouses.some(
          (w) => String(w) === String(nextWarehouseId)
        );

        if (!warehouseAllowed) {
          throw new UserInputError(
            "Selected warehouse is not allowed for this project"
          );
        }
      }

      /*
       * Project seller validation.
       * Supports both project.seller and old project.sellers[] shape.
       */
      if (project.seller) {
        if (String(project.seller) !== String(nextSellerId)) {
          throw new UserInputError(
            "Selected seller is not assigned to this project"
          );
        }
      }

      if (
        Array.isArray(project.sellers) &&
        project.sellers.length > 0
      ) {
        const sellerAllowed = project.sellers.some(
          (s) => String(s) === String(nextSellerId)
        );

        if (!sellerAllowed) {
          throw new UserInputError(
            "Selected seller is not assigned to this project"
          );
        }
      }

      sale.project = nextProjectId;
      sale.seller = nextSellerId;
      sale.warehouse = nextWarehouseId;
    }

    /*
     * Basic fields: allowed for draft and confirmed
     */
    if (data.customerName !== undefined) {
      sale.customerName = data.customerName?.trim();
    }

    if (data.phone !== undefined) {
      sale.phone = data.phone?.trim();
    }

    if (data.country !== undefined) {
      sale.country = data.country?.trim();
    }

    if (data.city !== undefined) {
      sale.city = data.city?.trim();
    }

    if (data.address !== undefined) {
      sale.address = data.address?.trim();
    }

    if (data.notes !== undefined) {
      sale.notes = data.notes?.trim();
    }

    if (data.discount !== undefined) {
      const discount = Number(data.discount);

      if (Number.isNaN(discount) || discount < 0) {
        throw new UserInputError("Discount cannot be negative");
      }

      sale.discount = discount;
    }

    if (data.deliveryCharges !== undefined) {
      const deliveryCharges = Number(data.deliveryCharges);

      if (Number.isNaN(deliveryCharges) || deliveryCharges < 0) {
        throw new UserInputError("Delivery charges cannot be negative");
      }

      sale.deliveryCharges = deliveryCharges;
    }

    if (data.paymentMode !== undefined) {
      if (!sale.payment) sale.payment = {};
      sale.payment.mode = data.paymentMode;
    }

    /*
     * Courier fields: allowed for draft and confirmed
     */
    if (
      data.courierId !== undefined ||
      data.courierName !== undefined ||
      data.trackingNo !== undefined
    ) {
      if (!sale.courier) sale.courier = {};

      if (data.courierId !== undefined) {
        if (
          data.courierId &&
          !mongoose.Types.ObjectId.isValid(data.courierId)
        ) {
          throw new UserInputError("Invalid courierId");
        }

        sale.courier.courierId = data.courierId || null;
      }

      if (data.courierName !== undefined) {
        sale.courier.courierName = data.courierName?.trim();
      }

      if (data.trackingNo !== undefined) {
        sale.courier.trackingNo = data.trackingNo?.trim();
      }
    }

    /*
     * Items can be updated only in draft sale
     */
    if (data.items !== undefined) {
      if (sale.status !== "draft") {
        throw new UserInputError(
          "Items can be updated only in draft sale"
        );
      }

      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new UserInputError(
          "At least one sale item is required"
        );
      }

      const updatedItems = [];
      const stockQtyMap = new Map();

      let subtotal = 0;
      let totalCost = 0;

      for (const item of data.items) {
        if (!mongoose.Types.ObjectId.isValid(item.productId)) {
          throw new UserInputError("Invalid productId");
        }

        const quantity = Number(item.quantity);
        const salePrice = Number(item.salePrice);

        if (Number.isNaN(quantity) || quantity <= 0) {
          throw new UserInputError(
            "Item quantity must be greater than 0"
          );
        }

        if (Number.isNaN(salePrice) || salePrice < 0) {
          throw new UserInputError(
            "Sale price cannot be negative"
          );
        }

        const product = await PRODUCT.findOne({
          _id: item.productId,
          isDeleted: { $ne: true },
        }).session(session);

        if (!product) {
          throw new UserInputError("Product not found");
        }

        let variantId = undefined;
        let variant = null;

        if (item.variantId) {
          if (!mongoose.Types.ObjectId.isValid(item.variantId)) {
            throw new UserInputError("Invalid variantId");
          }

          variantId = new mongoose.Types.ObjectId(item.variantId);

          /*
           * If you have PRODUCT_VARIANT model, keep this validation.
           * If your variant is embedded inside Product, adjust here.
           */
          if (typeof PRODUCT_VARIANT !== "undefined") {
            variant = await PRODUCT_VARIANT.findOne({
              _id: variantId,
              product: product._id,
              isDeleted: { $ne: true },
            }).session(session);

            if (!variant) {
              throw new UserInputError(
                `Variant not found for ${product.name}`
              );
            }
          }
        }

        const stockQuery = {
          warehouse: sale.warehouse,
          product: product._id,
        };

        if (variantId) {
          stockQuery.variant = variantId;
        } else {
          stockQuery.$or = [
            { variant: { $exists: false } },
            { variant: null },
          ];
        }

        const stock = await WAREHOUSE_STOCK.findOne(stockQuery)
          .session(session)
          .lean();

        if (!stock) {
          throw new UserInputError(
            `Stock record not found for ${product.name}`
          );
        }

        const availableQty =
          Number(stock.quantity || 0) -
          Number(stock.reservedQuantity || 0);

        const stockKey = `${String(product._id)}-${
          variantId ? String(variantId) : "no_variant"
        }`;

        const alreadyRequested = stockQtyMap.get(stockKey) || 0;
        const totalRequested = alreadyRequested + quantity;

        if (totalRequested > availableQty) {
          throw new UserInputError(
            `Insufficient available stock for ${product.name}. Available: ${availableQty}`
          );
        }

        stockQtyMap.set(stockKey, totalRequested);

        const costPrice = Number(stock.avgCost || 0);
        const lineTotal = quantity * salePrice;
        const lineCost = quantity * costPrice;

        subtotal += lineTotal;
        totalCost += lineCost;

        updatedItems.push({
          product: product._id,
          variant: variantId || undefined,

          productName: product.name,
          sku: variant?.sku || product.sku,

          quantity,
          salePrice,
          lineTotal: Number(lineTotal.toFixed(2)),

          costPrice: Number(costPrice.toFixed(2)),
          lineCost: Number(lineCost.toFixed(2)),
        });
      }

      sale.items = updatedItems;
      sale.subtotal = Number(subtotal.toFixed(2));
      sale.totalCost = Number(totalCost.toFixed(2));
      sale.grossProfit = Number((subtotal - totalCost).toFixed(2));
    }

    /*
     * Recalculate totals after any discount / delivery / item update
     */
    const subtotal = Number(sale.subtotal || 0);
    const discount = Number(sale.discount || 0);
    const deliveryCharges = Number(sale.deliveryCharges || 0);

    const totalAmount = subtotal - discount + deliveryCharges;

    if (totalAmount < 0) {
      throw new UserInputError(
        "Sale total cannot be negative"
      );
    }

    sale.totalAmount = Number(totalAmount.toFixed(2));

    /*
     * Keep payment balance updated.
     * If your Sale model pre-save hook already does this,
     * this still does not disturb it.
     */
    if (!sale.payment) sale.payment = {};

    const paidAmount = Number(sale.payment.paidAmount || 0);
    const balanceAmount = sale.totalAmount - paidAmount;

    sale.payment.balanceAmount = Number(
      Math.max(balanceAmount, 0).toFixed(2)
    );

    if (paidAmount <= 0) {
      sale.payment.status = "unpaid";
    } else if (paidAmount >= sale.totalAmount) {
      sale.payment.status = "paid";
    } else {
      sale.payment.status = "partial";
    }

    /*
     * History
     */
    const updatedAt = new Date();

    if (typeof pushHistory === "function") {
      pushHistory(sale, {
        status: sale.status,
        by: ctx.user._id,
        note: `Sale updated by ${role}`,
      });
    } else {
      if (!Array.isArray(sale.statusHistory)) {
        sale.statusHistory = [];
      }

      sale.statusHistory.push({
        status: sale.status,
        at: updatedAt,
        by: ctx.user._id,
        note: `Sale updated by ${role}`,
      });
    }

    await sale.save({ session });

    await session.commitTransaction();

    return sale;
  } catch (err) {
    await session.abortTransaction();

    if (
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError ||
      err instanceof UserInputError
    ) {
      throw err;
    }

    console.error("UpdateSale Error:", err);

    throw new ApolloError(
      err.message || "Failed to update sale"
    );
  } finally {
    session.endSession();
  }
},


  },
}; 

 export default saleResolvers 
