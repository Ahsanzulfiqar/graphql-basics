import mongoose from "mongoose";
const { Schema, model } = mongoose;

const sellerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    companyName: { type: String, trim: true, unique:true },
    address: { type: String, trim: true },

    // optional: seller type / commission
    sellerType: {
      type: String,
      enum: ["RESELLER", "AFFILIATE", "INTERNAL", "DISTRIBUTOR"],
      default: "RESELLER",
    },
    commissionType: {
      type: String,
      enum: ["PERCENT", "FIXED", "NONE"],
      default: "NONE",
    },
    commissionValue: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: { type: Boolean, default: true },
    // soft delete
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

// avoid duplicate sellers by email if you want
sellerSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: "string" } } }
);

export default model("seller", sellerSchema);
