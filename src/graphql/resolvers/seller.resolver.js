
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
        const q = { isDeleted: { $ne: true } };

        if (search) {
          const regex = { $regex: search, $options: "i" };
          q.$or = [{ name: regex }, { email: regex }, { phone: regex }, { companyName: regex }];
        }

        const skip = (Math.max(page, 1) - 1) * Math.max(limit, 1);

        const [total, data] = await Promise.all([
          SELLER.countDocuments(q),
          SELLER.find(q).sort({ createdAt: -1 }).skip(skip).limit(limit),
        ]);

        return {
          data,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      } catch (err) {
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