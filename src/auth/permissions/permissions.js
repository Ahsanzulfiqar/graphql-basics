import { AuthenticationError, ForbiddenError, UserInputError } from "apollo-server-express";
import PROJECT from "../../models/Project.js";
import WAREHOUSE from "../../models/warehouse.js";

export const requireAuth = (ctx) => {
  if (!ctx.user) throw new AuthenticationError("Login required");
  if (ctx.user.isActive === false) throw new ForbiddenError("User is inactive");
};

export const requireRoles = (ctx, roles) => {
  requireAuth(ctx);
  if (!roles.includes(ctx.user.role)) throw new ForbiddenError("Not allowed");
};

// Seller can only use assigned projects
export const requireProjectAccess = async (ctx, projectId) => {
  requireAuth(ctx);

  if (ctx.user.role !== "SELLER") return true;

  const allowed = (ctx.user.assignedProjects || []).some(
    (id) => String(id) === String(projectId)
  );

  if (!allowed) throw new ForbiddenError("You are not assigned to this project");
  return true;
};

// Warehouse selection must be allowed inside that project
export const requireWarehouseInProject = async (projectId, warehouseId) => {
  const project = await PROJECT.findById(projectId).select("_id warehouses isActive");
  if (!project) throw new UserInputError("Project not found");
  if (!project.isActive) throw new UserInputError("Project is inactive");

  const ok = (project.warehouses || []).some((w) => String(w) === String(warehouseId));
  if (!ok) throw new ForbiddenError("Warehouse is not allowed for this project");

  return project;
};

// Warehouse staff can only act on their assigned warehouses
export const requireWarehouseAccess = async (ctx, warehouseId) => {
  requireAuth(ctx);

  if (ctx.user.role !== "WAREHOUSE") return true;

  const allowed = (ctx.user.assignedWarehouses || []).some(
    (id) => String(id) === String(warehouseId)
  );

  if (!allowed) throw new ForbiddenError("You are not assigned to this warehouse");
  return true;
};

// Optional: validate warehouse exists (nice error)
export const ensureWarehouseExists = async (warehouseId) => {
  const wh = await WAREHOUSE.findById(warehouseId).select("_id");
  if (!wh) throw new UserInputError("Warehouse not found");
  return true;
};
