// src/models/Courier.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const courierSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    charges: {
      baseCharge: { type: Number, default: 0, min: 0 },
      codCharge: { type: Number, default: 0, min: 0 },
      returnCharge: { type: Number, default: 0, min: 0 },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

export default model("courier", courierSchema);