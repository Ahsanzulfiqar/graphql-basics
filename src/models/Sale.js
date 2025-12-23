import mongoose from "mongoose";
const { Schema, model } = mongoose;

const saleItemSchema = new Schema(
  {
    product: { type: Schema.Types.ObjectId, ref: "product", required: true },
    variant: { type: Schema.Types.ObjectId, ref: "productVariant" },

    productName: { type: String, required: true },
    variantName: { type: String },
    sku: { type: String },

    quantity: { type: Number, required: true, min: 1 },
    salePrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const saleSchema = new Schema(
  {
    seller: { type: Schema.Types.ObjectId, ref: "seller", required: true },
    warehouse: { type: Schema.Types.ObjectId, ref: "warehouse", required: true },
    invoiceNo: { type: String, trim: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    address: { type: String, trim: true },
    status: {
      type: String,
      enum: ["draft", "reserved", "shipped", "cancelled"],
      default: "draft",
      index: true,
    },
    items: { type: [saleItemSchema], required: true },

    subTotal: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    notes: { type: String, trim: true },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

export default model("sale", saleSchema);
