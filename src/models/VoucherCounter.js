import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true, // e.g. "JV"
    },

    seq: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("voucherCounter", counterSchema);