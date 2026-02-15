import bcrypt from "bcrypt";
import { AuthenticationError, ForbiddenError, UserInputError } from "apollo-server-express";
import USER from "../../models/User.js"
import PROJECT from "../../models/Project.js";
import WAREHOUSE from "../../models/Warehouse.js";
import { generateToken } from "../../auth/jwt/jwt.js";

const requireAuth = (ctx) => {
    console.log(ctx,"ctx")
  if (!ctx.user) throw new AuthenticationError("Login required");
  if (!ctx.user.isActive) throw new ForbiddenError("User is inactive");
};

const requireRoles = (ctx, roles) => {

    
  requireAuth(ctx);
  if (!roles.includes(ctx.user.role)) throw new ForbiddenError("Not allowed");
};

const validateProjects = async (ids = []) => {
  if (!ids?.length) return;
  const count = await PROJECT.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw new UserInputError("One or more projects not found");
};

const validateWarehouses = async (ids = []) => {
  if (!ids?.length) return;
  const count = await WAREHOUSE.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw new UserInputError("One or more warehouses not found");
};

const normalizeEmail = (email) => email.toLowerCase().trim();

export default {

    User: {
    assignedProjectDetails: async (user) => {
      if (!user.assignedProjects?.length) return [];

      return PROJECT.find({
        _id: { $in: user.assignedProjects },
      })
        .select("_id name")
        .lean();
    },

    assignedWarehouseDetails: async (user) => {
      if (!user.assignedWarehouses?.length) return [];

      return WAREHOUSE.find({
        _id: { $in: user.assignedWarehouses },
      })
        .select("_id name")
        .lean();
    },
  },
  
  Query: {
    Me: async (_, __, ctx) => ctx.user,

    GetAllUsers: async (_, __, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      return USER.find().sort({ createdAt: -1 });
    },

    GetUserById: async (_, { _id }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      return USER.findById(_id);
    },
  },

  Mutation: {
    Register: async (_, { data }) => {
        console.log("in")
      const email = normalizeEmail(data.email);

      const exists = await USER.findOne({ email });
      if (exists) throw new UserInputError("Email already exists");

      const passwordHash = await bcrypt.hash(data.password, 10);

      // Public register creates SELLER by default (recommended)
      const user = await USER.create({
        name: data.name,
        email,
        phone: data.phone,
        passwordHash,
        role: "ADMIN",
        isActive: true,
      });

  const token = generateToken("accessToken", { id: user._id, email: user.email, role:user.role });
      return { token, user };
    },

    Login: async (_, { data }) => {
      const email = normalizeEmail(data.email);
      const user = await USER.findOne({ email });
      if (!user) throw new AuthenticationError("Invalid email or password");
      if (!user.isActive) throw new ForbiddenError("User is inactive");

      const ok = await bcrypt.compare(data.password, user.passwordHash);
      if (!ok) throw new AuthenticationError("Invalid email or password");

     const token = generateToken("accessToken", { id: user._id, email: user.email, role:user.role, isActive:user.isActive });
      return { token, user };
    },

    CreateUser: async (_, { data }, ctx) => {
      requireRoles(ctx, ["ADMIN"]);

      const email = normalizeEmail(data.email);
      const exists = await USER.findOne({ email });
      if (exists) throw new UserInputError("Email already exists");

      await validateProjects(data.projectIds || []);
      await validateWarehouses(data.warehouseIds || []);

      const passwordHash = await bcrypt.hash(data.password, 10);

      const user = await USER.create({
        name: data.name,
        email,
        phone: data.phone,
        passwordHash,
        role: data.role,
        assignedProjects: data.projectIds || [],
        assignedWarehouses: data.warehouseIds || [],
        createdBy: ctx.user._id,
        isActive: true,
      });

      return user;
    },

    UpdateUser: async (_, { _id, data }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);

      if (data.projectIds !== undefined) await validateProjects(data.projectIds);
      if (data.warehouseIds !== undefined) await validateWarehouses(data.warehouseIds);

      const update = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.phone !== undefined) update.phone = data.phone;
      if (data.role !== undefined) update.role = data.role;
      if (data.projectIds !== undefined) update.assignedProjects = data.projectIds;
      if (data.warehouseIds !== undefined) update.assignedWarehouses = data.warehouseIds;
      if (data.isActive !== undefined) update.isActive = data.isActive;

      const user = await USER.findByIdAndUpdate(_id, { $set: update }, { new: true, runValidators: true });
      if (!user) throw new UserInputError("User not found");
      return user;
    },

    DeactivateUser: async (_, { _id }, ctx) => {
      requireRoles(ctx, ["ADMIN"]);
      const user = await USER.findByIdAndUpdate(_id, { $set: { isActive: false } }, { new: true });
      if (!user) throw new UserInputError("User not found");
      return "User deactivated";
    },

    AssignProjectsToUser: async (_, { userId, projectIds }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      await validateProjects(projectIds);

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { assignedProjects: projectIds } },
        { new: true }
      );
      if (!user) throw new UserInputError("User not found");
      return user;
    },

    AssignWarehousesToUser: async (_, { userId, warehouseIds }, ctx) => {
      requireRoles(ctx, ["ADMIN", "MANAGER"]);
      await validateWarehouses(warehouseIds);

      const user = await User.findByIdAndUpdate(
        userId,
        { $set: { assignedWarehouses: warehouseIds } },
        { new: true }
      );
      if (!user) throw new UserInputError("User not found");
      return user;
    },

    ChangeMyPassword: async (_, { oldPassword, newPassword }, ctx) => {
      requireAuth(ctx);
      if (!newPassword || newPassword.length < 6) {
        throw new UserInputError("Password must be at least 6 characters");
      }

      const user = await USER.findById(ctx.user._id);
      const ok = await bcrypt.compare(oldPassword, user.passwordHash);
      if (!ok) throw new AuthenticationError("Old password is incorrect");

      user.passwordHash = await bcrypt.hash(newPassword, 10);
      await user.save();

      return "Password updated";
    },
  },
};
