import mongoose from "mongoose";

const warehouseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    country: { type: String, required: true },
    city: { type: String, required: true },
    ismain: { type: Boolean, required: false },
    mainId: { type: String, required: false },
    contact: { type: String, required: true }
  },
  { timestamps: true }
);

// ✅ Prevent OverwriteModelError in nodemon / hot reload
export default mongoose.models.warehouse || mongoose.model("warehouse", warehouseSchema);
