import mongoose from "mongoose";
const { Schema, model } = mongoose;

const projectSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    channel: {
      type: String,
      required: true,
      trim: true,
    },

    warehouses: [
      {
        type: Schema.Types.ObjectId,
        ref: "warehouse",
        required: true,
      },
    ],

    // ✅ Single seller only
    seller: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

projectSchema.index({ name: 1 }, { unique: true });
projectSchema.index({ seller: 1 });
projectSchema.index({ warehouses: 1 });

export default model("project", projectSchema);