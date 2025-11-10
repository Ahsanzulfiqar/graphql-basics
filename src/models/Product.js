import mongoose from "mongoose";
import { type } from "os";
import { CountryCodes } from "validator/lib/isISO31661Alpha2";


const schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    brand: {
      type: String,
      required: true,
      trim: true,
    },
    sku: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    barcode: {
      type: String,
      required: false,
      trim: true,
    },
    description: {
      type: String,
      required: false,
    },

    category: {
      type: String,
      required: true,
      trim: true,
    },

    subCategory: {
      type: String,
      required: true,
      trim: true,
    },

    purchasePrice: {
      type: Number,
      required: true,
    },
    salePrice: {
      type: Number,
      required: true,
    },

    attributes: [
      {
        name: String,  // "Size", "Flavor", "Strength"
        value: String, // "60 capsules", "Chocolate", "Extra Strong"
      },
    ],

    isActive: {
      type: Boolean,
      required: true,
      default: true,
    },

    images: [
      {
        url: String,
        alt: String,
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("product", schema);



