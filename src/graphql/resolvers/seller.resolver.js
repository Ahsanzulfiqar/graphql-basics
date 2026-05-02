
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

import SELLER from "../../models/Seller.js";



const sellerResolvers = {
   
   
    Query: {

  GetSellers: async (_, { search = "", page = 1, limit = 20 }) => {
  try {
    
    const safePage = Math.max(Number(page) || 1, 1);
    const safeLimit = Math.max(Number(limit) || 20, 1);
    const skip = (safePage - 1) * safeLimit;

    const q = {
      isDeleted: { $ne: true },
      role: "SELLER",
    };

    if (search?.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };

      q.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { companyName: regex },
      ];
    }

    const [total, data] = await Promise.all([
      USER.countDocuments(q),
      USER.find(q)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
    ]);

    return {
      data: data.map((u) => ({
        ...u,
        _id: String(u._id),
      })),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1,
    };
  } catch (err) {
    console.error("GetSellers error:", err);
    throw new ApolloError(err.message || "Failed to fetch sellers");
  }
},

    GetSellerById: async (_, { id }) => {
      const seller = await SELLER.findOne({ _id: id, isDeleted: { $ne: true } });
      if (!seller) throw new UserInputError("Seller not found");
      return seller;
    },
  },
  Mutation: {
    CreateSeller: async (_, { data }) => {
      try {
        // basic validation
        if (!data.name || !data.name.trim()) {
          throw new UserInputError("Seller name is required");
        }

        const seller = await SELLER.create({
          name: data.name,
          email: data.email,
          phone: data.phone,
          companyName: data.companyName,
          address: data.address,
          sellerType: data.sellerType || "RESELLER",
          commissionType: data.commissionType || "NONE",
          commissionValue: data.commissionValue || 0,
        });

        return seller;
      } catch (err) {
        // duplicate email handling
        if (err.code === 11000) {
          throw new UserInputError("Seller with this email already exists");
        }
        throw new ApolloError(err.message || "Failed to create seller");
      }
    },

    UpdateSeller: async (_, { id, data }) => {
      try {
        const seller = await SELLER.findOne({ _id: id, isDeleted: { $ne: true } });
        if (!seller) throw new UserInputError("Seller not found");

        Object.keys(data).forEach((k) => {
          if (data[k] !== undefined) seller[k] = data[k];
        });

        await seller.save();
        return seller;
      } catch (err) {
        if (err.code === 11000) {
          throw new UserInputError("Seller with this email already exists");
        }
        throw new ApolloError(err.message || "Failed to update seller");
      }
    },

    DeleteSeller: async (_, { id }) => {
      const seller = await SELLER.findById(id);
      if (!seller) return true;

      seller.isDeleted = true;
      seller.deletedAt = new Date();
      seller.isActive = false;
      await seller.save();

      return true;
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
 export default sellerResolvers 