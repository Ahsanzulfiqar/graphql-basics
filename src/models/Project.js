import mongoose from "mongoose";
const { Schema, model } = mongoose;

const projectSchema = new Schema(
  {
    // Store / Project name
    name: {
      type: String,
      required: true,
      trim: true, // e.g. "HerbalsDubai Shopify"
    },

    // Sales channel
    channel: {
      type: String,
      required: true,
      trim: true, // Shopify / Amazon / Noon
    },

    // 🏬 Warehouses allowed for this project
    warehouses: [
      {
        type: Schema.Types.ObjectId,
        ref: "Warehouse",
        required: true,
      },
    ],

    // 👥 Sellers allowed to sell on this project
    sellers: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Unique project name
projectSchema.index({ name: 1 }, { unique: true });

// Helpful indexes
projectSchema.index({ sellers: 1 });
projectSchema.index({ warehouses: 1 });

export default model("project", projectSchema);
