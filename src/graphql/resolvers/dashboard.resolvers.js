import mongoose from "mongoose";
import SALE from "../../models/Sale.js";
import PURCHASE from "../../models/Product.js";
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";

const toObjectId = (id) => new mongoose.Types.ObjectId(id);

const startOfDay = (date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const getDateRange = (from, to) => {
  const now = new Date();

  const start = from
    ? startOfDay(from)
    : new Date(now.getFullYear(), now.getMonth(), 1);

  const end = to
    ? endOfDay(to)
    : endOfDay(now);

  return { start, end };
};

const fillMissingDates = (trend, days = 30) => {
  const map = new Map(trend.map((x) => [x.label, x.amount]));
  const result = [];

  const start = new Date();
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);

  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);

    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    const label = `${y}-${m}-${day}`;

    result.push({
      label,
      amount: Number(map.get(label) || 0),
    });
  }

  return result;
};

const buildWarehouseFilter = ({ warehouseId, warehouseIds }) => {
  if (warehouseId) {
    if (!mongoose.Types.ObjectId.isValid(warehouseId)) {
      throw new Error(`Invalid warehouseId: ${warehouseId}`);
    }
    return { warehouse: toObjectId(warehouseId) };
  }

  if (warehouseIds && warehouseIds.length > 0) {
    const invalidIds = warehouseIds.filter((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length) {
      throw new Error(`Invalid warehouseIds: ${invalidIds.join(", ")}`);
    }

    return {
      warehouse: {
        $in: warehouseIds.map((id) => toObjectId(id)),
      },
    };
  }

  // default admin behavior => all warehouses combined
  return {};
};

const dashboardResolver = {
     Query: {
    AdminDashboard: async (_, { warehouseId, warehouseIds, from, to }, ctx) => {
      const { start, end } = getDateRange(from, to);
      const warehouseFilter = buildWarehouseFilter({ warehouseId, warehouseIds });

      const salesMatch = {
        isDeleted: false,
        status: { $in: ["confirmed", "out_for_delivery", "delivered"] },
        createdAt: { $gte: start, $lte: end },
        ...warehouseFilter,
      };

      const purchasesMatch = {
        isDeleted: false,
        postedToStock: true,
        createdAt: { $gte: start, $lte: end },
        ...warehouseFilter,
      };

      const stockMatch = {
        ...warehouseFilter,
      };

      const receivablesMatch = {
        isDeleted: false,
        status: { $in: ["confirmed", "out_for_delivery", "delivered"] },
        "payment.balanceAmount": { $gt: 0 },
        ...warehouseFilter,
      };

      const payablesMatch = {
        isDeleted: false,
        postedToStock: true,
        "payment.balanceAmount": { $gt: 0 },
        ...warehouseFilter,
      };

      const trendStart = new Date();
      trendStart.setDate(trendStart.getDate() - 29);
      trendStart.setHours(0, 0, 0, 0);

      const salesTrendMatch = {
        isDeleted: false,
        status: { $in: ["confirmed", "out_for_delivery", "delivered"] },
        createdAt: { $gte: trendStart, $lte: endOfDay(new Date()) },
        ...warehouseFilter,
      };

      const [
        revenueAgg,
        purchasesAgg,
        stockValueAgg,
        receivablesAgg,
        payablesAgg,
        cogsAgg,
        salesTrendAgg,
        lowStockAgg,
        countrySalesAgg,
      ] = await Promise.all([
        // Revenue
        SALE.aggregate([
          { $match: salesMatch },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$totalAmount", 0] } },
            },
          },
        ]),

        // Purchases
        PURCHASE.aggregate([
          { $match: purchasesMatch },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$totalAmount", 0] } },
            },
          },
        ]),

        // Stock Value
        WAREHOUSE_STOCK.aggregate([
          { $match: stockMatch },
          {
            $group: {
              _id: null,
              total: {
                $sum: {
                  $multiply: [
                    { $ifNull: ["$quantity", 0] },
                    { $ifNull: ["$avgCost", 0] },
                  ],
                },
              },
            },
          },
        ]),

        // Receivables
        SALE.aggregate([
          { $match: receivablesMatch },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$payment.balanceAmount", 0] } },
            },
          },
        ]),

        // Payables
        PURCHASE.aggregate([
          { $match: payablesMatch },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$payment.balanceAmount", 0] } },
            },
          },
        ]),

        // COGS
        SALE.aggregate([
          { $match: salesMatch },
          { $unwind: "$items" },
          {
            $group: {
              _id: null,
              total: { $sum: { $ifNull: ["$items.lineCost", 0] } },
            },
          },
        ]),

        // Sales Trend
        SALE.aggregate([
          { $match: salesTrendMatch },
          {
            $group: {
              _id: {
                year: { $year: "$createdAt" },
                month: { $month: "$createdAt" },
                day: { $dayOfMonth: "$createdAt" },
              },
              amount: { $sum: { $ifNull: ["$totalAmount", 0] } },
            },
          },
          {
            $project: {
              _id: 0,
              label: {
                $concat: [
                  { $toString: "$_id.year" },
                  "-",
                  {
                    $cond: [
                      { $lt: ["$_id.month", 10] },
                      { $concat: ["0", { $toString: "$_id.month" }] },
                      { $toString: "$_id.month" },
                    ],
                  },
                  "-",
                  {
                    $cond: [
                      { $lt: ["$_id.day", 10] },
                      { $concat: ["0", { $toString: "$_id.day" }] },
                      { $toString: "$_id.day" },
                    ],
                  },
                ],
              },
              amount: 1,
            },
          },
          { $sort: { label: 1 } },
        ]),

        // Low Stock List
        WAREHOUSE_STOCK.aggregate([
          { $match: stockMatch },
          {
            $addFields: {
              quantitySafe: { $ifNull: ["$quantity", 0] },
              reservedSafe: { $ifNull: ["$reserved", 0] },
              reorderLevelSafe: { $ifNull: ["$reorderLevel", 0] },
              avgCostSafe: { $ifNull: ["$avgCost", 0] },
            },
          },
          {
            $addFields: {
              availableQty: {
                $subtract: ["$quantitySafe", "$reservedSafe"],
              },
            },
          },
          {
            $match: {
              $expr: {
                $lte: ["$availableQty", "$reorderLevelSafe"],
              },
            },
          },
          {
            $lookup: {
              from: "products",
              localField: "product",
              foreignField: "_id",
              as: "productDoc",
            },
          },
          {
            $lookup: {
              from: "productvariants",
              localField: "variant",
              foreignField: "_id",
              as: "variantDoc",
            },
          },
          {
            $lookup: {
              from: "warehouses",
              localField: "warehouse",
              foreignField: "_id",
              as: "warehouseDoc",
            },
          },
          {
            $project: {
              _id: 0,
              productId: "$product",
              variantId: "$variant",
              warehouseId: "$warehouse",
              productName: { $arrayElemAt: ["$productDoc.name", 0] },
              variantName: { $arrayElemAt: ["$variantDoc.name", 0] },
              sku: {
                $ifNull: [
                  { $arrayElemAt: ["$variantDoc.sku", 0] },
                  { $arrayElemAt: ["$productDoc.sku", 0] },
                ],
              },
              warehouseName: { $arrayElemAt: ["$warehouseDoc.name", 0] },
              currentQty: "$quantitySafe",
              reservedQty: "$reservedSafe",
              availableQty: "$availableQty",
              reorderLevel: "$reorderLevelSafe",
              avgCost: "$avgCostSafe",
            },
          },
          { $sort: { availableQty: 1, productName: 1 } },
          { $limit: 20 },
        ]),

        // Country-wise Sales Summary
        SALE.aggregate([
          { $match: salesMatch },
          {
            $group: {
              _id: { $ifNull: ["$country", "Unknown"] },
              orders: { $sum: 1 },
              revenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
              receivables: { $sum: { $ifNull: ["$payment.balanceAmount", 0] } },
            },
          },
          {
            $project: {
              _id: 0,
              country: "$_id",
              orders: 1,
              revenue: 1,
              receivables: 1,
            },
          },
          { $sort: { revenue: -1, orders: -1 } },
        ]),
      ]);

      const revenue = Number(revenueAgg?.[0]?.total || 0);
      const purchases = Number(purchasesAgg?.[0]?.total || 0);
      const stockValue = Number(stockValueAgg?.[0]?.total || 0);
      const receivables = Number(receivablesAgg?.[0]?.total || 0);
      const payables = Number(payablesAgg?.[0]?.total || 0);
      const cogs = Number(cogsAgg?.[0]?.total || 0);

      const netProfit = Number((revenue - cogs).toFixed(2));

      return {
        revenue,
        netProfit,
        stockValue,
        purchases,
        receivables,
        payables,
        salesTrend: fillMissingDates(salesTrendAgg || [], 30),
        lowStockItems: lowStockAgg || [],
        countrySales: countrySalesAgg || [],
      };
    },
  },

}
export default dashboardResolver;