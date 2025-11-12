import mongoose from "mongoose";
import { CountryCodes } from "validator/lib/isISO31661Alpha2";


const schema = new mongoose.Schema(
  {
    product:{
      type: String,
      required: true,
    },
    name: {
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

       packSize: {
      type: Number,
    },
    netWeight: {
      type: String,
    },


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

module.exports = mongoose.model("productVarient", schema);



