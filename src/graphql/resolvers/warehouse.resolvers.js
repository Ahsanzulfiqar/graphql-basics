
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
import mongoose from "mongoose";



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
  
  // GetWarehouseStock: async (_, { filter = {}, page = 1, limit = 50 }, context) => {



  //   const query = {};

  //   if (filter.warehouseId) {
  //     query.warehouse = new mongoose.Types.ObjectId(filter.warehouseId);
  //   }

  //   if (filter.productId) {
  //     query.product = new mongoose.Types.ObjectId(filter.productId);
  //   }

  //   if (filter.variantId) {
  //     query.variant = new mongoose.Types.ObjectId(filter.variantId);
  //   }

  //   const pageNum = Math.max(page, 1);
  //   const pageSize = Math.max(limit, 1);
  //   const skip = (pageNum - 1) * pageSize;

  //   const [total, data] = await Promise.all([
  //     WAREHOUSE_STOCK.countDocuments(query),
  //     WAREHOUSE_STOCK.find(query)
  //       .sort({ updatedAt: -1 })
  //       .skip(skip)
  //       .limit(pageSize)
  //   ]);

  //   return {
  //     data,
  //     total,
  //     page: pageNum,
  //     limit: pageSize,
  //     totalPages: Math.ceil(total / pageSize) || 1
  //   };
  // },


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