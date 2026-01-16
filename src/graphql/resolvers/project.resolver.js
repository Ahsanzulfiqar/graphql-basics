import PROJECT from "../../models/Project.js";
import WAREHOUSE from '../../models/warehouse.js';
import USER from "../../models/User.js";
import COURIER from "../../models/Courier.js";
import { requireAuth } from "../../auth/permissions/permissions.js";

import { AuthenticationError, ForbiddenError, UserInputError } from "apollo-server-express";

import { ApolloError } from "apollo-server-express";


const requireRoles = (ctx, roles) => {
  if (!ctx.user) throw new AuthenticationError("Login required");

  if (!roles.includes(ctx.user.role)) throw new ForbiddenError("Not allowed");
};

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
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      return PROJECT.findById(_id);
    },

        GetAllCouriers: async (_, __, ctx) => {
      requireAuth(ctx);
      return COURIER.find().sort({ name: 1 });
    },

    GetCourierById: async (_, { _id }, ctx) => {
      requireAuth(ctx);
      return COURIER.findById(_id);
    },


  },

  Mutation: {
    CreateProject: async (_, { data }, ctx) => {
     
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

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
        });
        return created;
      } catch (err) {
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

        const updated = await COURIER.findByIdAndUpdate(
          _id,
          { $set: update },
          { new: true, runValidators: true }
        );

        if (!updated) throw new UserInputError("Courier not found");
        return updated;
      } catch (err) {
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
