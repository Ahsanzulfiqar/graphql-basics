// src/models/Courier.js
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const courierSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default model("courier", courierSchema);