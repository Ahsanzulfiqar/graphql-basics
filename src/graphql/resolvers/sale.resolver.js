import mongoose from "mongoose";
import { ApolloError, UserInputError } from "apollo-server-express";
import SALE from "../../models/Sale.js";
import SELLER from "../../models/Seller.js";
import WAREHOUSE from "../../models/warehouse.js";
import PRODUCT from "../../models/Product.js";
import PRODUCT_VARIANT from "../../models/ProductVarient.js";
import STOCK_LEDGER from "../../models/StockLedger.js";
import { reserveStock, releaseReservedStock,addBackToBatch } from "../../services/stock.helpers.js";
import { fifoConsume } from "../../services/fifoConsume.js";

import { requireRoles, requireWarehouseAccess, ensureWarehouseExists } from "../../auth/permissions/permissions.js";



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

    GetSalesSummaryBySeller: async (_, { sellerId, dateFrom, dateTo }) => {
      const match = { isDeleted: { $ne: true }, status: "shipped" };
      if (sellerId) match.seller = new mongoose.Types.ObjectId(sellerId);

      if (dateFrom || dateTo) {
        match.createdAt = {};
        if (dateFrom) match.createdAt.$gte = new Date(dateFrom);
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
     CreateSale: async (_, { data }, ctx) => {

      // requireRoles(ctx, ["SELLER", "SALES", "ADMIN", "MANAGER"]);
   console.log("in")

      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        // Validate seller + warehouse
        const seller = await SELLER.findOne({ _id: data.sellerId, isDeleted: { $ne: true } }).session(session);
        if (!seller) throw new UserInputError("Seller not found");

        const warehouse = await WAREHOUSE.findById(data.warehouseId).session(session);
        if (!warehouse) throw new UserInputError("Warehouse not found");

        if (!data.items || data.items.length === 0) throw new UserInputError("Sale items required");

        // Validate products/variants exist (IDs)
        const productIds = [...new Set(data.items.map((i) => i.productId))];
        const variantIds = [...new Set(data.items.filter((i) => i.variantId).map((i) => i.variantId))];

        const [products, variants] = await Promise.all([
          PRODUCT.find({ _id: { $in: productIds } }).select("_id").session(session),
          PRODUCT_VARIANT.find({ _id: { $in: variantIds } }).select("_id product").session(session),
        ]);

        if (products.length !== productIds.length) throw new UserInputError("One or more products not found");
        if (variantIds.length && variants.length !== variantIds.length) throw new UserInputError("One or more variants not found");

        // Optional: ensure each variant belongs to its product (recommended)
        const variantMap = new Map(variants.map((v) => [String(v._id), String(v.product)]));
        for (const it of data.items) {
          if (it.variantId) {
            const belongsTo = variantMap.get(String(it.variantId));
            if (belongsTo && belongsTo !== String(it.productId)) {
              throw new UserInputError("Variant does not belong to the given product");
            }
          }
        }

        // Build items + totals
        const items = data.items.map((i) => {
          const qty = Number(i.quantity);
          const price = Number(i.salePrice);
          const lineTotal = Number((qty * price).toFixed(2));

          return {
            product: i.productId,
            variant: i.variantId,
            productName: i.productName,
            variantName: i.variantName,
            sku: i.sku,
            quantity: qty,
            salePrice: price,
            lineTotal,
          };
        });

        const subTotal = Number(items.reduce((s, x) => s + x.lineTotal, 0).toFixed(2));
        const taxAmount = Number((data.taxAmount || 0).toFixed(2));
        const totalAmount = Number((subTotal + taxAmount).toFixed(2));

        const [sale] = await SALE.create(
          [
            {
              seller: data.sellerId,
              warehouse: data.warehouseId,
              invoiceNo: data.invoiceNo,
              customerName: data.customerName,
              customerPhone: data.customerPhone,
              address: data.address,

              status: "draft",
              items,

              subTotal,
              taxAmount,
              totalAmount,

              notes: data.notes,
              statusTimestamps: { draftAt: new Date() },
              statusHistory: [
                { status: "draft", at: new Date(), by: ctx?.user?._id, note: "Sale created" },
              ],
            },
          ],
          { session }
        );

        await session.commitTransaction();
        session.endSession();
        return sale;
      } catch (err) {
        await session.abortTransaction();
        session.endSession();
        // duplicate tracking/index etc.
        if (err.code === 11000) throw new UserInputError("Duplicate value error");
        throw new ApolloError(err.message || "Failed to create sale");
      }
    },

        ConfirmSale: async (_, { saleId }, context) => {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        const sale = await SALE.findById(saleId).session(session);
        if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

        if (sale.status !== "draft") throw new UserInputError("Only draft sale can be confirmed");

        // Reserve each item
        for (const it of sale.items) {
          await reserveStock(
            { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
            session
          );
        }

        sale.status = "confirmed";
        pushHistory(sale, { status: "confirmed", by: context?.user?._id, note: "Sale confirmed (stock reserved)" });

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

      MarkOutForDelivery: async (_, { saleId, data }, context) => {
      try {
        const sale = await SALE.findById(saleId);
        if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

        if (sale.status !== "confirmed") {
          throw new UserInputError("Only confirmed sale can be marked out for delivery");
        }

        if (!data?.courierName?.trim()) throw new UserInputError("courierName is required");
        if (!data?.trackingNo?.trim()) throw new UserInputError("trackingNo is required");

        sale.courierName = data.courierName.trim();
        sale.trackingNo = data.trackingNo.trim();
        sale.trackingUrl = data.trackingUrl?.trim();
        sale.deliveryNotes = data.deliveryNotes?.trim();
        sale.shippedAt = data.shippedAt ? new Date(data.shippedAt) : new Date();

        sale.status = "out_for_delivery";
        pushHistory(sale, {
          status: "out_for_delivery",
          by: context?.user?._id,
          note: `Courier: ${sale.courierName}, Tracking: ${sale.trackingNo}`,
        });

        await sale.save();
        return sale;
      } catch (err) {
        if (err.code === 11000) throw new UserInputError("Tracking number already exists");
        throw new ApolloError(err.message || "Failed to mark out for delivery");
      }
    },


      MarkDelivered: async (_, { saleId }, context) => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const sale = await SALE.findById(saleId).session(session);
        if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

        if (!["confirmed", "out_for_delivery"].includes(sale.status)) {
          throw new UserInputError("Sale must be confirmed or out_for_delivery to mark delivered");
        }

        // Optional: require tracking before delivery if you want
        // if (!sale.trackingNo) throw new UserInputError("Tracking number missing");

        const ledgerDocs = [];

        for (const it of sale.items) {
          // release reserved now
          await releaseReservedStock(
            { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
            session
          );

          // FIFO consume physical stock
          const usedBatches = await fifoConsume(
            { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
            session
          );

          // Ledger OUT per batch
          for (const b of usedBatches) {
            ledgerDocs.push({
              sale: sale._id, // ✅ recommended field in StockLedger
              warehouse: sale.warehouse,
              product: it.product,
              variant: it.variant,

              quantityIn: 0,
              quantityOut: b.qtyUsed,

              batchNo: b.batchNo,
              expiryDate: b.expiryDate,

              refType: "SALE",
              refNo: sale.invoiceNo || String(sale._id),
              notes: "Delivered sale (FIFO out)",
            });
          }
        }

        if (ledgerDocs.length) await STOCK_LEDGER.insertMany(ledgerDocs, { session });

        sale.status = "delivered";
        pushHistory(sale, { status: "delivered", by: context?.user?._id, note: "Sale delivered (stock consumed)" });

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


      CancelSale: async (_, { saleId }, context) => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const sale = await SALE.findById(saleId).session(session);
        if (!sale || sale.isDeleted) return true;

        if (sale.status === "delivered") {
          throw new UserInputError("Cannot cancel delivered sale. Use ReturnSale.");
        }
        if (sale.status === "cancelled") return true;

        // Release reserved if sale was confirmed/out_for_delivery
        if (["confirmed", "out_for_delivery"].includes(sale.status)) {
          for (const it of sale.items) {
            await releaseReservedStock(
              { warehouseId: sale.warehouse, productId: it.product, variantId: it.variant, qty: it.quantity },
              session
            );
          }
        }

        sale.status = "cancelled";
        pushHistory(sale, { status: "cancelled", by: context?.user?._id, note: "Sale cancelled" });

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

      ReturnSale: async (_, { saleId }, context) => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const sale = await SALE.findById(saleId).session(session);
        if (!sale || sale.isDeleted) throw new UserInputError("Sale not found");

        if (sale.status !== "delivered") throw new UserInputError("Only delivered sale can be returned");

        // Fetch SALE ledger lines for this sale
        // Preferred: by sale field (recommended)
        let saleOutRows = await STOCK_LEDGER.find({ refType: "SALE", sale: sale._id })
          .session(session)
          .lean();

        // Fallback (if you didn't add sale field)
        if (!saleOutRows.length) {
          const refNo = sale.invoiceNo || String(sale._id);
          saleOutRows = await StockLedger.find({ refType: "SALE", refNo }).session(session).lean();
        }

        if (!saleOutRows.length) throw new UserInputError("Sale ledger not found. Cannot return safely.");

        const returnLedgerDocs = [];
        const returnRef = `RET-${sale.invoiceNo || String(sale._id)}`;

        for (const row of saleOutRows) {
          const qty = Number(row.quantityOut || 0);
          if (!qty) continue;

          await addBackToBatch(
            {
              warehouseId: row.warehouse,
              productId: row.product,
              variantId: row.variant,
              qty,
              batchNo: row.batchNo,
              expiryDate: row.expiryDate,
            },
            session
          );

          returnLedgerDocs.push({
            sale: sale._id,
            warehouse: row.warehouse,
            product: row.product,
            variant: row.variant,

            quantityIn: qty,
            quantityOut: 0,

            batchNo: row.batchNo,
            expiryDate: row.expiryDate,

            refType: "SALE_RETURN",
            refNo: returnRef,
            notes: "Return against delivered sale",
          });
        }

        if (returnLedgerDocs.length) await STOCK_LEDGER.insertMany(returnLedgerDocs, { session });

        sale.status = "returned";
        pushHistory(sale, { status: "returned", by: context?.user?._id, note: "Sale returned (stock added back)" });

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


  },
};

 export default saleResolvers 
