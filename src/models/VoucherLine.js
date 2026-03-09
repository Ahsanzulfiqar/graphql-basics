import mongoose from "mongoose";

const voucherLineSchema = new mongoose.Schema(
  {
    voucherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "voucher",
      required: true,
      index: true,
    },

    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "account",
      required: true,
      index: true,
    },

    debit: {
      type: Number,
      default: 0,
    },

    credit: {
      type: Number,
      default: 0,
    },

    memo: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

// Helpful for ledger performance
voucherLineSchema.index({ accountId: 1, createdAt: 1 });

export default mongoose.model("voucherLine", voucherLineSchema);