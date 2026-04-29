import PROJECT from "../../models/Project.js";
import WAREHOUSE from '../../models/warehouse.js';
import USER from "../../models/User.js";
import COURIER from "../../models/Courier.js";
import {  requireRoles  } from "../../auth/permissions/permissions.js";
import mongoose from "mongoose";

import { AuthenticationError, ForbiddenError, UserInputError ,ApolloError} from "apollo-server-express";


const validateWarehouses = async (warehouseIds) => {
  if (!warehouseIds || warehouseIds.length === 0) {
    throw new UserInputError("At least one warehouse is required");
  }
  const count = await WAREHOUSE.countDocuments({ _id: { $in: warehouseIds } });
  if (count !== warehouseIds.length) throw new UserInputError("One or more warehouses not found");
};

const validateUsers = async (userIds) => {
  if (!userIds || userIds.length === 0) return;
  const count = await USER.countDocuments({ _id: { $in: userIds } });
  if (count !== userIds.length) throw new UserInputError("One or more users not found");
};

export default {
  Query: {
    GetAllProjects: async (_, __, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      return PROJECT.find().sort({ createdAt: -1 });
    },

    GetProjectById: async (_, { _id }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER","SELLER"]);
      return PROJECT.findById(_id);
    },

        GetProjectsBySeller: async (_, { sellerId }) => {
      const projects = await PROJECT.find({
        sellers: new mongoose.Types.ObjectId(sellerId),
        isActive: true,
      })
        .populate("warehouses")
        .populate("sellers");

      return projects;
    },


    GetAllCouriers: async (_, __, ctx) => {
      try {
        // 🔐 Authentication required
        if (!ctx.user) {
          throw new AuthenticationError("Login required");
        }

        
        requireRoles(ctx, ["ADMIN", "MANAGER", "SALES", "WAREHOUSE"]);

        const couriers = await COURIER.find({ isActive: true }).sort({ name: 1 });

        return couriers;
      } catch (err) {
        console.error("GetAllCouriers error:", err);
        throw new ApolloError("Failed to fetch couriers");
      }
    },

      // ✅ Get Courier By ID
    GetCourierById: async (_, { _id }, ctx) => {
      try {
        // 🔐 Authentication required
        if (!ctx.user) {
          throw new AuthenticationError("Login required");
        }
         requireRoles(ctx, ["ADMIN", "MANAGER", "SALES", "WAREHOUSE"]);

        const courier = await COURIER.findById(_id);

        if (!courier) {
          throw new UserInputError("Courier not found");
        }

        return courier;

      } catch (err) {
        console.error("GetCourierById error:", err);

        if (err instanceof UserInputError) throw err;
        if (err instanceof AuthenticationError) throw err;

        throw new ApolloError("Failed to fetch courier");
      }
    },


  },

  Mutation: {
    CreateProject: async (_, { data }, ctx) => {
     
      requireRoles(ctx, ["ADMIN", "MANAGER","SELLER"]);

      await validateWarehouses(data.warehouseIds);
      await validateUsers(data.sellerIds);

      try {
        const project = await PROJECT.create({
          name: data.name,
          channel: data.channel,
          warehouses: data.warehouseIds,
          sellers: data.sellerIds || [],
          isActive: data.isActive ?? true,
        });
        return project;
      } catch (err) {
        console.error("CreateProject error:", err);
        if (err.code === 11000) throw new UserInputError("Project name already exists");
        throw new Error("Failed to create project");
      }
    },

    UpdateProject: async (_, { _id, data }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
console.log("")
      if (data.warehouseIds !== undefined) await validateWarehouses(data.warehouseIds);
      if (data.sellerIds !== undefined) await validateUsers(data.sellerIds);

      try {
        const update = {};
        if (data.name !== undefined) update.name = data.name;
        if (data.channel !== undefined) update.channel = data.channel;
        if (data.warehouseIds !== undefined) update.warehouses = data.warehouseIds;
        if (data.sellerIds !== undefined) update.sellers = data.sellerIds;
        if (data.isActive !== undefined) update.isActive = data.isActive;

        const updated = await PROJECT.findByIdAndUpdate(
          _id,
          { $set: update },
          { new: true, runValidators: true }
        );

        if (!updated) throw new UserInputError("Project not found");
        return updated;
      } catch (err) {
        console.error("UpdateProject error:", err);
        if (err.code === 11000) throw new UserInputError("Project name already exists");
        throw new Error("Failed to update project");
      }
    },

    DeleteProject: async (_, { _id }, ctx) => {
      requireRoles(ctx, ["ADMIN"]); // recommended admin only
       try {
            const deleted = await PROJECT.findByIdAndDelete(_id);
      if (!deleted) throw new UserInputError("Project not found");

      return "Project deleted successfully";
       } catch (error) {
         throw new UserInputError("At least one warehouse is required"); 
       }
  
    },

    AssignSellersToProject: async (_, { projectId, sellerIds }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      await validateUsers(sellerIds);

      const updated = await PROJECT.findByIdAndUpdate(
        projectId,
        { $set: { sellers: sellerIds } },
        { new: true }
      );

      if (!updated) throw new UserInputError("Project not found");
      return updated;
    },

    SetProjectWarehouses: async (_, { projectId, warehouseIds }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      await validateWarehouses(warehouseIds);

      const updated = await PROJECT.findByIdAndUpdate(
        projectId,
        { $set: { warehouses: warehouseIds } },
        { new: true }
      );

      if (!updated) throw new UserInputError("Project not found");
      return updated;
    },

  CreateCourier: async (_, { data }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      try {
        const created = await COURIER.create({
          name: data.name,
          isActive: data.isActive ?? true,
          charges: {
            baseCharge: data?.charges?.baseCharge ?? 0,
            codCharge: data?.charges?.codCharge ?? 0,
            returnCharge: data?.charges?.returnCharge ?? 0,
          },
        });

        return created;
      } catch (err) {
        console.error("CreateCourier error:", err);
        if (err.code === 11000) throw new UserInputError("Courier name already exists");
        throw new Error("Failed to create courier");
      }
    },

       UpdateCourier: async (_, { _id, data }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      try {
        const update = {};

        if (data.name !== undefined) update.name = data.name;
        if (data.isActive !== undefined) update.isActive = data.isActive;

        // ✅ Nested charges update (only update sent fields)
        if (data.charges !== undefined) {
          if (data.charges.baseCharge !== undefined)
            update["charges.baseCharge"] = data.charges.baseCharge;

          if (data.charges.codCharge !== undefined)
            update["charges.codCharge"] = data.charges.codCharge;

          if (data.charges.returnCharge !== undefined)
            update["charges.returnCharge"] = data.charges.returnCharge;
        }

        const updated = await COURIER.findByIdAndUpdate(
          _id,
          { $set: update },
          { new: true, runValidators: true }
        );

        if (!updated) throw new UserInputError("Courier not found");
        return updated;
      } catch (err) {
        console.error("UpdateCourier error:", err);
        if (err.code === 11000) throw new UserInputError("Courier name already exists");
        throw new Error("Failed to update courier");
      }
    },

     DeleteCourier: async (_, { _id }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      const deleted = await COURIER.findByIdAndDelete(_id);
      if (!deleted) throw new UserInputError("Courier not found");

      return "Courier deleted successfully";
    },

  },

};
