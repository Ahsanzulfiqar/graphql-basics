import mongoose from "mongoose";

const { Schema, model } = mongoose;

const userSchema = new Schema(
  {
    // Basic info
    name: {
      type: String,
      trim: true,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    passwordHash: {
      type: String,
      required: true,
    },

    // 🔐 Role-based access
    role: {
      type: String,
      enum: ["ADMIN", "MANAGER", "WAREHOUSE", "SALES", "SELLER"],
      required: true,
      default: "SELLER",
    },

    // 🏪 Project access (for SELLER + SALES if needed)
    assignedProjects: [
      {
        type: Schema.Types.ObjectId,
        ref: "project",
      },
    ],

    // 🏬 Warehouse access (for WAREHOUSE role)
    assignedWarehouses: [
      {
        type: Schema.Types.ObjectId,
        ref: "warehouse",
      },
    ],

    // Seller-specific info (optional, future use)
    sellerCode: {
      type: String,
      trim: true,
    },

    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },

    // Audit
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "user",
    },
  },
  {
    timestamps: true,
  }
);

// 🔎 Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ role: 1 });

export default model("user", userSchema);
