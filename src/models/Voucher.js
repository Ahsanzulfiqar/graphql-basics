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
      enum: ["JOURNAL"],
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
  },
  { timestamps: true }
);

export default mongoose.model("voucher", voucherSchema);