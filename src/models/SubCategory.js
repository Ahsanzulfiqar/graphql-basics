import mongoose from "mongoose";
const { Schema, model } = mongoose;

const subCategorySchema = new Schema(
  {
    category: { type: Schema.Types.ObjectId, ref: "category", required: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true },
    description: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// ✅ Unique subcategory per category (recommended)
subCategorySchema.index(
  { category: 1, slug: 1 },
  { unique: true, partialFilterExpression: { slug: { $type: "string" } } }
);

export default model("subCategory", subCategorySchema);
