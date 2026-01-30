import mongoose from "mongoose";
const { Schema, model } = mongoose;



const productSchema = new Schema(
  {
    product:{
      type: Schema.Types.ObjectId,
      ref: "product",
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
      type: String,
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

// ProductVariant model file
export default mongoose.model("productVariant", productSchema, "productvarients");






