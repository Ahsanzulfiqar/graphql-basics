import mongoose from "mongoose";
const { Schema, model } = mongoose;

/**
 * 🧩 Sub-schema for each product/variant line item in the purchase
 */
const purchaseItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
    productName:{
      type: String,
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      ref: "productVarient",
      required:true,
    },
    variantName:{
      type: String,
      required: true,
    },
    
 sku:{
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    batchNo: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },
  },
  { _id: false }
);

/**
 * 🧾 Main Purchase schema
 */
const purchaseSchema = new Schema(
  {
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },

    invoiceNo: {
      type: String,
      trim: true,
    },

    // 🔗 Better to store warehouse as ObjectId (so it links to Warehouse model)
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },

    purchaseDate: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["draft", "confirmed", "received", "cancelled"],
      default: "draft",
    },

    items: {
      type: [purchaseItemSchema],
      required: true,
    },

    subTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    notes: {
      type: String,
      trim: true,
    },

    postedToStock: {
      type: Boolean,
      default: false,
    },

        // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },

  },
  { timestamps: true }
);

export default model("purchase", purchaseSchema);
