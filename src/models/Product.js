
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      uniqe:true
    },
    brand: {
      type: String,
      required: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,   // <- unique
      trim: true,
    },
    category:{
       type: String,
      required: true,
    },
    subCategory:{
           type: String,
      required: true,
    },

    // ...
    purchasePrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },
    attributes: [
      { name: String, value: String }
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    images: [
      { url: String, alt: String }
    ],
  },
  { timestamps: true }
);

// Explicit indexes
productSchema.index({ sku: 1 }, { unique: true });
// optional: productSchema.index({ name: 1 }, { unique: true });

const PRODUCT = model("product", productSchema);
export default PRODUCT;
