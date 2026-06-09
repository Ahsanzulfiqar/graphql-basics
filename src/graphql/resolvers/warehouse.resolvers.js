
import Speakeasy from "speakeasy";
import QRCode from "qrcode";
import {
  ValidationError,
  UserInputError,
  ApolloError,
  AuthenticationError,
  SyntaxError,
  ForbiddenError,
} from "apollo-server-express";
import validator from "validator";
const { equals } = validator;

// *Model
import WAREHOUSE from "../../models/warehouse.js";
import WAREHOUSE_STOCK from "../../models/WareHouseStock.js";
import STOCK_TRANSFER from "../../models/StockTransfer.js";
import STOCK_LEDGER from "../../models/StockLedger.js";
import PRODUCT from "../../models/Product.js";
import {applyStockMovement} from "../../services/stock.helpers.js"


import mongoose from "mongoose";

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const requireRoles = (ctx, roles = []) => {
  if (!ctx.user) {
    throw new AuthenticationError("Login required");
  }

  if (ctx.user.isActive === false) {
    throw new ForbiddenError("User is inactive");
  }

  if (!roles.includes(ctx.user.role)) {
    throw new ForbiddenError("Not allowed");
  }
};

const handleError = (error, resolverName) => {
  console.error(`❌ ${resolverName} Error:`, error);

  if (
    error instanceof AuthenticationError ||
    error instanceof ForbiddenError ||
    error instanceof UserInputError ||
    error instanceof ApolloError
  ) {
    throw error;
  }

  throw new ApolloError("Something went wrong", "INTERNAL_SERVER_ERROR");
};

const generateTransferNo = () => {
  return `TRF-${Date.now()}`;
};




const warehouseResolvers = {
  Query: {
    GetAllWarehouses: async () => {
      try {
        const warehouses = await WAREHOUSE.find();
        return warehouses;
      } catch (error) {
        console.error("Error fetching warehouses:", error);
        throw new Error("Failed to get warehouses");
      }
    },

    GetWarehouseById: async (_, { _id }) => {
      try {
        const warehouse = await WAREHOUSE.findById(_id);
        if (!warehouse) {
          throw new Error("Warehouse not found");
        }
        return warehouse;
      } catch (error) {
        console.error("Error fetching warehouse:", error);
        throw new Error("Failed to get warehouse");
      }
    },


GetWarehouseStock: async (_, { filter = {}, page = 1, limit = 50 }, ctx) => {
  const query = {};

  if (filter?.warehouseId) query.warehouse = new mongoose.Types.ObjectId(filter.warehouseId);
  if (filter?.productId) query.product = new mongoose.Types.ObjectId(filter.productId);
  if (filter?.variantId) query.variant = new mongoose.Types.ObjectId(filter.variantId);

  const pageNum = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(limit) || 50, 1);
  const skip = (pageNum - 1) * pageSize;

  const [total, rows] = await Promise.all([
    WAREHOUSE_STOCK.countDocuments(query),
    WAREHOUSE_STOCK.find(query)
      .populate("warehouse", "_id name")
      .populate("product", "_id name")
      .populate("variant", "_id name")
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
  ]);

  const data = rows.map((r) => {
    const warehouseId = r.warehouse?._id ? String(r.warehouse._id) : String(r.warehouse);
    const productId = r.product?._id ? String(r.product._id) : String(r.product);
    const variantId = r.variant?._id ? String(r.variant._id) : (r.variant ? String(r.variant) : null);

    return {
      _id: String(r._id),

      // ✅ IMPORTANT: return IDs (not objects) for GraphQL ID fields
      warehouse: warehouseId,
      product: productId,
      variant: variantId,

      // ✅ extra fields for frontend
      warehouseName: r.warehouse?.name || null,
      productName: r.product?.name || null,
      variantName: r.variant?.name || null,

      quantity: r.quantity ?? 0,
      reserved: r.reserved ?? 0,
      reorderLevel: r.reorderLevel ?? 0,
      batches: r.batches || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  return {
    data,
    total,
    page: pageNum,
    limit: pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
},


    GetWarehouseProductBatches: async (
    _,
    { warehouseId, productId, variantId }
  ) => {
    const query = {
      warehouse: new mongoose.Types.ObjectId(warehouseId),
      product: new mongoose.Types.ObjectId(productId),
    };

    if (variantId) {
      query.variant = new mongoose.Types.ObjectId(variantId);
    }

    const stock = await WAREHOUSE_STOCK.findOne(query).lean();

    if (!stock || !stock.batches) return [];

    return stock.batches;
  },

GetWarehouseStockById: async (_, { id }) => {
  try {
    // ✅ Validate ID format
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError("Invalid warehouse stock ID");
    }

    const r = await WAREHOUSE_STOCK.findById(id)
      .populate("warehouse", "_id name")
      .populate("product", "_id name sku")
      .populate("variant", "_id name sku")
      .lean();

    // ✅ Not found
    if (!r) {
      throw new UserInputError("Warehouse stock not found");
    }

    // ✅ Safe ID extraction
    const warehouseId = r.warehouse?._id
      ? String(r.warehouse._id)
      : r.warehouse
      ? String(r.warehouse)
      : null;

    const productId = r.product?._id
      ? String(r.product._id)
      : r.product
      ? String(r.product)
      : null;

    const variantId = r.variant?._id
      ? String(r.variant._id)
      : r.variant
      ? String(r.variant)
      : null;

    return {
      _id: String(r._id),

      warehouse: warehouseId,
      product: productId,
      variant: variantId,

      warehouseName: r.warehouse?.name || null,
      productName: r.product?.name || null,
      variantName: r.variant?.name || null,

      quantity: r.quantity ?? 0,
      reserved: r.reserved ?? 0,
      reorderLevel: r.reorderLevel ?? 0,
      avgCost: r.avgCost ?? 0,

      batches: r.batches || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  } catch (error) {
    console.error("❌ GetWarehouseStockById Error:", error);

    // ✅ Known errors (don’t wrap again)
    if (error instanceof UserInputError) {
      throw error;
    }

    // ✅ Unexpected errors
    throw new ApolloError(
      "Failed to fetch warehouse stock",
      "INTERNAL_SERVER_ERROR"
    );
  }
},

  GetStockTransfers: async (_, __, ctx) => {
  try {
    requireRoles(ctx, ["ADMIN", "MANAGER", "WAREHOUSE"]);

    const rows = await STOCK_TRANSFER.find()
      .populate("fromWarehouse", "_id name")
      .populate("toWarehouse", "_id name")
      .populate("items.product", "_id name")
      .populate("items.variant", "_id name")
      .sort({ createdAt: -1 })
      .lean();

    return rows.map((r) => ({
      _id: String(r._id),

      transferNo: r.transferNo,

      fromWarehouse: r.fromWarehouse?._id
        ? String(r.fromWarehouse._id)
        : String(r.fromWarehouse),

      fromWarehouseName: r.fromWarehouse?.name || null,

      toWarehouse: r.toWarehouse?._id
        ? String(r.toWarehouse._id)
        : String(r.toWarehouse),

      toWarehouseName: r.toWarehouse?.name || null,

      items: (r.items || []).map((item) => ({
        product: item.product?._id
          ? String(item.product._id)
          : String(item.product),

        productName: item.product?.name || null,

        variant: item.variant?._id
          ? String(item.variant._id)
          : item.variant
          ? String(item.variant)
          : null,

        variantName: item.variant?.name || null,

        quantity: item.quantity || 0,

        batchNo: item.batchNo || null,
        expiryDate: item.expiryDate || null,
      })),

      status: r.status,
      note: r.note,

      createdBy: r.createdBy ? String(r.createdBy) : null,
      confirmedBy: r.confirmedBy ? String(r.confirmedBy) : null,

      confirmedAt: r.confirmedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  } catch (error) {
    handleError(error, "GetStockTransfers");
  }
},

    GetStockTransferById: async (_, { id }, ctx) => {
      try {
        requireRoles(ctx, ["ADMIN", "MANAGER", "WAREHOUSE"]);

        if (!isValidObjectId(id)) {
          throw new UserInputError("Invalid transfer ID");
        }

        const transfer = await STOCK_TRANSFER.findById(id).lean();

        if (!transfer) {
          throw new UserInputError("Stock transfer not found");
        }

        return transfer;
      } catch (error) {
        handleError(error, "GetStockTransferById");
      }
    },

   
  },
  Mutation: {

   
    CreateWarehouse: async (_, args) => {
  try {
   
      const data = args.data;
      const warehouse = new WAREHOUSE({
          name: data.name,
          contact: data.contact,
          ismain: data.ismain,
          mainId:data.mainId,
          country:data.country,
          city:data.city
        });

        const result = await warehouse.save()
        console.log(result,"result")

    return "Warehouse created successfully";
  } catch (error) {
    console.log("Error CreateWarehouse", error);
    throw error;
  }
},




    UpdateWarehouse: async (_, { _id, data }) => {
      try {
        const warehouse = await WAREHOUSE.findByIdAndUpdate(
          _id,
          { $set: data },
          { new: true }
        );

        if (!warehouse) {
          throw new Error("Warehouse not found");
        }

        return "Warehouse updated successfully";
      } catch (error) {
        console.error("Error updating warehouse:", error);
        throw new Error("Failed to update warehouse");
      }
    },
    

     CreateStockTransfer: async (_, { data }, ctx) => {
      try {
        requireRoles(ctx, ["ADMIN", "MANAGER", "WAREHOUSE"]);

        if (!isValidObjectId(data.fromWarehouse)) {
          throw new UserInputError("Invalid from warehouse");
        }

        if (!isValidObjectId(data.toWarehouse)) {
          throw new UserInputError("Invalid to warehouse");
        }

        if (String(data.fromWarehouse) === String(data.toWarehouse)) {
          throw new UserInputError("From warehouse and to warehouse cannot be same");
        }

        if (!data.items || data.items.length === 0) {
          throw new UserInputError("Transfer items are required");
        }

        for (const item of data.items) {
          if (!isValidObjectId(item.product)) {
            throw new UserInputError("Invalid product ID");
          }

          if (item.variant && !isValidObjectId(item.variant)) {
            throw new UserInputError("Invalid variant ID");
          }

          if (!item.quantity || Number(item.quantity) <= 0) {
            throw new UserInputError("Quantity must be greater than 0");
          }
        }

        const transfer = await STOCK_TRANSFER.create({
          transferNo: generateTransferNo(),
          fromWarehouse: data.fromWarehouse,
          toWarehouse: data.toWarehouse,
          items: data.items.map((item) => ({
            product: item.product,
            variant: item.variant || undefined,
            quantity: Number(item.quantity),
            batchNo: item.batchNo || undefined,
            expiryDate: item.expiryDate || undefined,
          })),
          note: data.note,
          status: "draft",
          createdBy: ctx.user._id,
        });

        return transfer;
      } catch (error) {
        handleError(error, "CreateStockTransfer");
      }
    },

     ConfirmStockTransfer: async (_, { id }, ctx) => {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        requireRoles(ctx, ["ADMIN", "MANAGER", "WAREHOUSE"]);

        if (!isValidObjectId(id)) {
          throw new UserInputError("Invalid transfer ID");
        }

        const transfer = await STOCK_TRANSFER.findById(id).session(session);

        if (!transfer) {
          throw new UserInputError("Stock transfer not found");
        }

        if (transfer.status !== "draft") {
          throw new UserInputError("Only draft transfer can be confirmed");
        }

        for (const item of transfer.items) {
          const qty = Number(item.quantity || 0);

          if (qty <= 0) {
            throw new UserInputError("Transfer quantity must be greater than 0");
          }

          const sourceStock = await WAREHOUSE_STOCK.findOne({
            warehouse: transfer.fromWarehouse,
            product: item.product,
            variant: item.variant || undefined,
          }).session(session);

          if (!sourceStock) {
            throw new UserInputError("Source warehouse stock not found");
          }

          const availableQty =
            Number(sourceStock.quantity || 0) -
            Number(sourceStock.reserved || 0);

          if (availableQty < qty) {
            throw new UserInputError(
              `Insufficient stock. Available: ${availableQty}, Required: ${qty}`
            );
          }

          const sourceAvgCost = Number(sourceStock.avgCost || 0);

          // ✅ Deduct from source warehouse
          sourceStock.quantity = Number(sourceStock.quantity || 0) - qty;

          // ✅ Batch deduction from source
          if (item.batchNo) {
            const sourceBatch = sourceStock.batches.find(
              (b) => String(b.batchNo) === String(item.batchNo)
            );

            if (!sourceBatch) {
              throw new UserInputError(`Batch ${item.batchNo} not found in source warehouse`);
            }

            if (Number(sourceBatch.quantity || 0) < qty) {
              throw new UserInputError(
                `Insufficient batch quantity. Batch available: ${sourceBatch.quantity}, Required: ${qty}`
              );
            }

            sourceBatch.quantity = Number(sourceBatch.quantity || 0) - qty;

            sourceStock.batches = sourceStock.batches.filter(
              (b) => Number(b.quantity || 0) > 0
            );
          }

          await sourceStock.save({ session });

          // ✅ Find or create destination stock
          let destinationStock = await WAREHOUSE_STOCK.findOne({
            warehouse: transfer.toWarehouse,
            product: item.product,
            variant: item.variant || undefined,
          }).session(session);

          if (!destinationStock) {
            destinationStock = new WAREHOUSE_STOCK({
              warehouse: transfer.toWarehouse,
              product: item.product,
              variant: item.variant || undefined,
              quantity: 0,
              reserved: 0,
              reorderLevel: 0,
              avgCost: 0,
              batches: [],
            });
          }

          // ✅ Weighted average cost at destination
          const oldQty = Number(destinationStock.quantity || 0);
          const oldAvgCost = Number(destinationStock.avgCost || 0);

          const incomingQty = qty;
          const incomingAvgCost = sourceAvgCost;

          const newTotalQty = oldQty + incomingQty;

          if (newTotalQty > 0) {
            destinationStock.avgCost =
              (oldQty * oldAvgCost + incomingQty * incomingAvgCost) /
              newTotalQty;
          }

          // ✅ Add quantity to destination
          destinationStock.quantity = newTotalQty;

          // ✅ Batch add to destination
          if (item.batchNo) {
            const destinationBatch = destinationStock.batches.find(
              (b) => String(b.batchNo) === String(item.batchNo)
            );

            if (destinationBatch) {
              destinationBatch.quantity =
                Number(destinationBatch.quantity || 0) + qty;
            } else {
              destinationStock.batches.push({
                batchNo: item.batchNo,
                expiryDate: item.expiryDate || null,
                quantity: qty,
              });
            }
          }

          await destinationStock.save({ session });

          // ✅ Ledger OUT
          await STOCK_LEDGER.create(
            [
              {
                transfer: transfer._id,
                product: item.product,
                variant: item.variant || undefined,
                warehouse: transfer.fromWarehouse,
                quantityIn: 0,
                quantityOut: qty,
                batchNo: item.batchNo || undefined,
                expiryDate: item.expiryDate || undefined,
                refType: "TRANSFER_OUT",
                refNo: transfer.transferNo,
                notes: `Transferred out to warehouse ${transfer.toWarehouse}`,
              },

              // ✅ Ledger IN
              {
                transfer: transfer._id,
                product: item.product,
                variant: item.variant || undefined,
                warehouse: transfer.toWarehouse,
                quantityIn: qty,
                quantityOut: 0,
                batchNo: item.batchNo || undefined,
                expiryDate: item.expiryDate || undefined,
                refType: "TRANSFER_IN",
                refNo: transfer.transferNo,
                notes: `Transferred in from warehouse ${transfer.fromWarehouse}`,
              },
            ],
            { session }
          );
        }

        transfer.status = "transferred";
        transfer.confirmedBy = ctx.user._id;
        transfer.confirmedAt = new Date();

        await transfer.save({ session });

        await session.commitTransaction();
        session.endSession();

        return transfer;
      } catch (error) {
        await session.abortTransaction();
        session.endSession();

        handleError(error, "ConfirmStockTransfer");
      }
    },

       CancelStockTransfer: async (_, { id }, ctx) => {
      try {
        requireRoles(ctx, ["ADMIN", "MANAGER", "WAREHOUSE"]);

        if (!isValidObjectId(id)) {
          throw new UserInputError("Invalid transfer ID");
        }

        const transfer = await STOCK_TRANSFER.findById(id);

        if (!transfer) {
          throw new UserInputError("Stock transfer not found");
        }

        if (transfer.status !== "draft") {
          throw new UserInputError("Only draft transfer can be cancelled");
        }

        transfer.status = "cancelled";
        await transfer.save();

        return transfer;
      } catch (error) {
        handleError(error, "CancelStockTransfer");
      }
    },

    AddOpeningStockForAllProducts: async (
  _,
  { warehouseId, quantity },
  ctx
) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  if (!["ADMIN"].includes(ctx.user.role)) {
    throw new ForbiddenError("Only admin can perform this action");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const warehouse = await WAREHOUSE.findById(warehouseId).session(session);

    if (!warehouse) {
      throw new UserInputError("Warehouse not found");
    }

    const products = await PRODUCT.find({
      isDeleted: { $ne: true },
    }).session(session);

    for (const product of products) {
      await applyStockMovement(
        {
          warehouse: warehouseId,
          product: product._id,
          deltaQty: quantity,
        },
        session
      );

      await STOCK_LEDGER.create(
        [
          {
            warehouse: warehouseId,
            product: product._id,
            quantityIn: quantity,
            quantityOut: 0,
            refType: "OPENING",
            refNo: `OPEN-${Date.now()}`,
            notes: "Bulk opening stock",
            createdBy: ctx.user._id,
          },
        ],
        { session }
      );
    }

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      productsUpdated: products.length,
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw new ApolloError(err.message);
  }
},
AddOpeningStock: async (_, { data }, ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");
console.log()
  if (!["ADMIN", "MANAGER", "WAREHOUSE"].includes(ctx.user.role)) {
    throw new ForbiddenError("User not allowed to add opening stock");
  }

  const {
    warehouseId,
    productId,
    variantId,
    batches,
    note,
  } = data;

  if (!batches || batches.length === 0) {
    throw new UserInputError("At least one batch is required");
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

    let totalQty = 0;
    let totalValue = 0;

    for (const b of batches) {
      if (!b.quantity || b.quantity <= 0) {
        throw new UserInputError("Batch quantity must be greater than 0");
      }

      if (b.unitCost == null || b.unitCost < 0) {
        throw new UserInputError("Batch unitCost is required and cannot be negative");
      }

      totalQty += Number(b.quantity);
      totalValue += Number(b.quantity) * Number(b.unitCost);
    }

    const query = {
      warehouse: warehouseId,
      product: productId,
    };

    if (variantId) {
      query.variant = variantId;
    } else {
      query.variant = { $exists: false };
    }

    let stock = await WAREHOUSE_STOCK.findOne(query).session(session);

    if (!stock) {
      const stockData = {
        warehouse: warehouseId,
        product: productId,
        quantity: 0,
        reserved: 0,
        avgCost: 0,
        batches: [],
      };

      if (variantId) stockData.variant = variantId;

      stock = new WAREHOUSE_STOCK(stockData);
    }

    const oldQty = Number(stock.quantity || 0);
    const oldAvgCost = Number(stock.avgCost || 0);
    const oldValue = oldQty * oldAvgCost;

    stock.quantity = oldQty + totalQty;

    stock.avgCost =
      stock.quantity > 0
        ? (oldValue + totalValue) / stock.quantity
        : 0;

    for (const b of batches) {
      const expiry = b.expiryDate ? new Date(b.expiryDate) : undefined;

      const existingBatch = stock.batches.find((batch) => {
        const batchExpiry = batch.expiryDate
          ? new Date(batch.expiryDate).toISOString().split("T")[0]
          : null;

        const inputExpiry = expiry
          ? new Date(expiry).toISOString().split("T")[0]
          : null;

        return (
          batch.batchNo === b.batchNo &&
          batchExpiry === inputExpiry &&
          Number(batch.unitCost || 0) === Number(b.unitCost || 0)
        );
      });

      if (existingBatch) {
        existingBatch.quantity += Number(b.quantity);
      } else {
        stock.batches.push({
          batchNo: b.batchNo,
          expiryDate: expiry,
          quantity: Number(b.quantity),
          unitCost: Number(b.unitCost),
        });
      }

      const ledgerData = {
        warehouse: warehouseId,
        product: productId,
        quantityIn: Number(b.quantity),
        quantityOut: 0,
        batchNo: b.batchNo,
        expiryDate: expiry,
        unitCost: Number(b.unitCost),
        totalValue: Number(b.quantity) * Number(b.unitCost),
        refType: "OPENING",
        refNo: `OPEN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        notes: note || "Opening stock entry",
        createdBy: ctx.user._id,
      };

      if (variantId) ledgerData.variant = variantId;

      await STOCK_LEDGER.create([ledgerData], { session });
    }

    await stock.save({ session });

    await session.commitTransaction();
    session.endSession();

    return stock;
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    if (
      err instanceof UserInputError ||
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError
    ) {
      console.log(err)
      throw err;
    }

    throw new ApolloError(err.message || "Failed to add opening stock");
  }
},
    
  },

  Subscription: {
    newMessage: {
      subscribe(parent, args, { pubsub }, info) {
        return pubsub.asyncIterator("MESSAGE");
      },
    },
  },
};
 export default warehouseResolvers 