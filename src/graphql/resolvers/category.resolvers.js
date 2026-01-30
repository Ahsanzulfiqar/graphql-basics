import mongoose from "mongoose";
import { ApolloError, UserInputError } from "apollo-server-express";

import CATEGORY from "../../models/Category.js";
import SUBCATEGORY from "../../models/SubCategory.js";

// ✅ Slug helper
const makeSlug = (name = "") =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

// ✅ Pagination helper
function getPaging(page = 1, limit = 20) {
  const pageNum = Math.max(Number(page) || 1, 1);
  const pageSize = Math.max(Number(limit) || 20, 1);
  const skip = (pageNum - 1) * pageSize;
  return { pageNum, pageSize, skip };
}

// ✅ Sorting helper
function getSort(sortBy = "updatedAt", sortOrder = "desc") {
  const order = String(sortOrder).toLowerCase() === "asc" ? 1 : -1;
  return { [sortBy]: order };
}

async function ensureCategoryExists(categoryId) {
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    throw new UserInputError("Invalid categoryId");
  }
  const cat = await CATEGORY.findOne({ _id: categoryId, isDeleted: false }).select("_id name").lean();
  if (!cat) throw new UserInputError("Category not found");
  return cat;
}

async function ensureUniqueCategorySlug(slug, excludeId = null) {
  const q = { slug, isDeleted: false };
  if (excludeId) q._id = { $ne: excludeId };
  const exists = await CATEGORY.findOne(q).select("_id").lean();
  if (exists) throw new UserInputError("Category already exists");
}

async function ensureUniqueSubCategorySlug(categoryId, slug, excludeId = null) {
  const q = { category: categoryId, slug, isDeleted: false };
  if (excludeId) q._id = { $ne: excludeId };
  const exists = await SUBCATEGORY.findOne(q).select("_id").lean();
  if (exists) throw new UserInputError("SubCategory already exists in this category");
}

const categoryResolvers = {

SubCategory: {
    categoryName: async (sub) => {
      const cid = sub?.category?._id ? String(sub.category._id) : String(sub.category || "");
      if (!cid) return null;

      const cat = await CATEGORY.findById(cid).select("name").lean();
      return cat?.name || null;
    },
  },

  Query: {
    GetCategoryById: async (_, { id }) => {
      if (!mongoose.Types.ObjectId.isValid(id)) throw new UserInputError("Invalid category id");
      return await CATEGORY.findOne({ _id: id, isDeleted: false });
    },

 FilterCategories: async (_, { filter = {}, page = 1, limit = 20 }) => {
  try {
    const { pageNum, pageSize, skip } = getPaging(page, limit);
    const sort = getSort(filter?.sortBy, filter?.sortOrder);

    const q = {};
    if (!filter?.includeDeleted) q.isDeleted = false;
    if (filter?.isActive !== undefined) q.isActive = filter.isActive;

    if (filter?.search?.trim()) {
      const s = filter.search.trim();
      q.$or = [
        { name: { $regex: s, $options: "i" } },
        { slug: { $regex: s, $options: "i" } },
        { description: { $regex: s, $options: "i" } },
      ];
    }

    

    const [total, data] = await Promise.all([
      CATEGORY.countDocuments(q),
      CATEGORY.find(q).sort(sort).skip(skip).limit(pageSize).lean(),
    ]);

   

    return {
      data: data || [],
      total: total || 0,
      page: pageNum,
      limit: pageSize,
      totalPages: Math.max(Math.ceil((total || 0) / pageSize), 1),
    };
  } catch (err) {
    console.error("❌ FilterCategories error:", err);
    throw new ApolloError(err.message || "Failed to filter categories");
  }
},


    GetSubCategoryById: async (_, { id }) => {
      if (!mongoose.Types.ObjectId.isValid(id)) throw new UserInputError("Invalid subcategory id");
      return await SUBCATEGORY.findOne({ _id: id, isDeleted: false });
    },

    FilterSubCategories: async (_, { filter = {}, page = 1, limit = 20 }) => {
      const { pageNum, pageSize, skip } = getPaging(page, limit);
      const sort = getSort(filter.sortBy, filter.sortOrder);

      const q = {};
      if (!filter.includeDeleted) q.isDeleted = false;
      if (filter.isActive !== undefined) q.isActive = filter.isActive;

      if (filter.categoryId) {
        if (!mongoose.Types.ObjectId.isValid(filter.categoryId)) throw new UserInputError("Invalid categoryId");
        q.category = filter.categoryId;
      }

      if (filter.search?.trim()) {
        const s = filter.search.trim();
        q.$or = [
          { name: { $regex: s, $options: "i" } },
          { slug: { $regex: s, $options: "i" } },
          { description: { $regex: s, $options: "i" } },
        ];
      }

      const [total, data] = await Promise.all([
        SUBCATEGORY.countDocuments(q),
        SUBCATEGORY.find(q).sort(sort).skip(skip).limit(pageSize),
      ]);

      return {
        data,
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.ceil(total / pageSize) || 1,
      };
    },
  },

  Mutation: {
    CreateCategory: async (_, { data }, ctx) => {
      try {
        const name = data?.name?.trim();
        if (!name) throw new UserInputError("name is required");

        const slug = makeSlug(name);
        await ensureUniqueCategorySlug(slug);

        const doc = await CATEGORY.create({
          name,
          slug,
          description: data.description?.trim(),
          isActive: data.isActive ?? true,
        });

        return doc;
      } catch (err) {
        if (err.code === 11000) throw new UserInputError("Category already exists");
        throw new ApolloError(err.message || "Failed to create category");
      }
    },

    UpdateCategory: async (_, { id, data }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new UserInputError("Invalid category id");

        const doc = await CATEGORY.findById(id);
        if (!doc || doc.isDeleted) throw new UserInputError("Category not found");

        if (data.name !== undefined) {
          const name = data.name.trim();
          if (!name) throw new UserInputError("name cannot be empty");
          const slug = makeSlug(name);
          await ensureUniqueCategorySlug(slug, doc._id);
          doc.name = name;
          doc.slug = slug;
        }

        if (data.description !== undefined) doc.description = data.description?.trim();
        if (data.isActive !== undefined) doc.isActive = data.isActive;

        await doc.save();
        return doc;
      } catch (err) {
        if (err.code === 11000) throw new UserInputError("Category already exists");
        throw new ApolloError(err.message || "Failed to update category");
      }
    },

    DeleteCategory: async (_, { id }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new UserInputError("Invalid category id");

        const doc = await CATEGORY.findById(id);
        if (!doc || doc.isDeleted) return true;

        // Optional: block delete if subcategories exist
        const hasSubs = await SUBCATEGORY.exists({ category: doc._id, isDeleted: false });
        if (hasSubs) throw new UserInputError("Cannot delete category: subcategories exist");

        doc.isDeleted = true;
        doc.deletedAt = new Date();
        doc.isActive = false;
        await doc.save();
        return true;
      } catch (err) {
        throw new ApolloError(err.message || "Failed to delete category");
      }
    },

    CreateSubCategory: async (_, { data }) => {
      try {
        const name = data?.name?.trim();
        if (!name) throw new UserInputError("name is required");

        const categoryId = data.categoryId;
        const cat = await ensureCategoryExists(categoryId);

        const slug = makeSlug(name);
        await ensureUniqueSubCategorySlug(cat._id, slug);

        const doc = await SUBCATEGORY.create({
          category: cat._id,
          name,
          slug,
          description: data.description?.trim(),
          isActive: data.isActive ?? true,
        });

        return doc;
      } catch (err) {
        if (err.code === 11000) throw new UserInputError("SubCategory already exists");
        throw new ApolloError(err.message || "Failed to create subcategory");
      }
    },

    UpdateSubCategory: async (_, { id, data }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new UserInputError("Invalid subcategory id");

        const doc = await SUBCATEGORY.findById(id);
        if (!doc || doc.isDeleted) throw new UserInputError("SubCategory not found");

        let categoryId = doc.category;

        if (data.categoryId !== undefined) {
          const cat = await ensureCategoryExists(data.categoryId);
          categoryId = cat._id;
          doc.category = cat._id;
        }

        if (data.name !== undefined) {
          const name = data.name.trim();
          if (!name) throw new UserInputError("name cannot be empty");
          const slug = makeSlug(name);
          await ensureUniqueSubCategorySlug(categoryId, slug, doc._id);
          doc.name = name;
          doc.slug = slug;
        }

        if (data.description !== undefined) doc.description = data.description?.trim();
        if (data.isActive !== undefined) doc.isActive = data.isActive;

        await doc.save();
        return doc;
      } catch (err) {
        if (err.code === 11000) throw new UserInputError("SubCategory already exists");
        throw new ApolloError(err.message || "Failed to update subcategory");
      }
    },

    DeleteSubCategory: async (_, { id }) => {
      try {
        if (!mongoose.Types.ObjectId.isValid(id)) throw new UserInputError("Invalid subcategory id");

        const doc = await SUBCATEGORY.findById(id);
        if (!doc || doc.isDeleted) return true;

        doc.isDeleted = true;
        doc.deletedAt = new Date();
        doc.isActive = false;
        await doc.save();
        return true;
      } catch (err) {
        throw new ApolloError(err.message || "Failed to delete subcategory");
      }
    },
  },
};

export default categoryResolvers;
