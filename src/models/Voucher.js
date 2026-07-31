import mongoose from "mongoose";

const voucherSchema = new mongoose.Schema(
  {
    voucherNo: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["JOURNAL","PURCHASE","PAYMENT"],
      default: "JOURNAL",
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    memo: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: ["DRAFT", "POSTED", "VOID"],
      default: "POSTED",
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },

    voidReason: String,
    voidAt: Date,

sourceType: {
  type: String,
  enum: [
    "MANUAL",
    "SALE",
    "SALE_PAYMENT",
    "PURCHASE",
    "PURCHASE_PAYMENT",
    "MONEY_IN",
    "MONEY_OUT",
    "EXPENSE",
    "STOCK_ADJUSTMENT",
    "OPENING_BALANCE",
    "SALES_RETURN",
    "PURCHASE_RETURN",
    "SALE_COGS",
    "SALE_COURIER"
  ],
  default: "MANUAL",
},

sourceId: {
  type: mongoose.Schema.Types.ObjectId,
},

paymentMode: {
  type: String,
  enum: ["COD", "ONLINE", null],
  default: null,
},

  },
  { timestamps: true }
);

export default mongoose.model("voucher", voucherSchema);