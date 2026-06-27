
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
import { requireRoles } from "../../auth/permissions/permissions.js";
import SELLER from "../../models/Seller.js";
import USER from "../../models/User.js";




const sellerResolvers = {
   
   
    Query: {

   GetSellers: async (_, __, ctx) => {
      try {
        if (!ctx.user) {
          throw new AuthenticationError("Login required");
        }

        requireRoles(ctx, ["ADMIN", "MANAGER"]);

        const sellers = await USER.find({
          role: "SELLER",
          isDeleted: { $ne: true },
          isActive: true,
        })
          .sort({ createdAt: -1 })
          .lean();

        return sellers || [];
      } catch (err) {
        console.error("GetAllSellers error:", err);

        if (
          err instanceof AuthenticationError ||
          err instanceof ForbiddenError ||
          err instanceof UserInputError
        ) {
          throw err;
        }

        throw new ApolloError("Failed to fetch sellers");
      }
    },

  GetSellerById: async (_, { id }, ctx) => {
  try {
    if (!ctx.user) {
      throw new AuthenticationError("Login required");
    }

    requireRoles(ctx, ["ADMIN", "MANAGER", "SELLER"]);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new UserInputError("Invalid seller id");
    }

    const seller = await USER.findOne({
      _id: id,
      role: "SELLER",
      isDeleted: { $ne: true },
    });

    if (!seller) {
      throw new UserInputError("Seller not found");
    }

    return seller;
  } catch (err) {
    console.error("GetSellerById error:", err);

    if (
      err instanceof AuthenticationError ||
      err instanceof ForbiddenError ||
      err instanceof UserInputError
    ) {
      throw err;
    }

    throw new ApolloError("Failed to fetch seller");
  }
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