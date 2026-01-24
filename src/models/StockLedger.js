// models/stockLedger.model.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const stockLedgerSchema = new Schema(
  {
    // 🔗 Links
    purchase: {
      type: Schema.Types.ObjectId,
      ref: "purchase",
    },
    // later you can add: sale, adjustment, transfer, etc.

    product: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      ref: "productVarient", // keep same as your purchase item ref
      required: false,
    },
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },

    // 👇 Movement
    quantityIn: {
      type: Number,
      default: 0,
      min: 0,
    },
    quantityOut: {
      type: Number,
      default: 0,
      min: 0,
    },

    batchNo: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },

    // 🧾 Why this movement happened
    refType: {
      type: String,
      enum: ["PURCHASE", "SALE", "ADJUSTMENT", "SALE_RETURN", "OPENING"],
      default: "PURCHASE",
      index: true,
    },
    refNo: {
      type: String, // invoiceNo, adjustment code, etc.
      trim: true,
    },

    notes: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

export default model("stockLedger", stockLedgerSchema);
