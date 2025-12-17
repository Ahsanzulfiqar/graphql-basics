
import mongoose from "mongoose";
const { Schema, model } = mongoose;

const warehouseStockSchema = new Schema(
  {
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },
    product: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      ref: "productVariant",
    },
    quantity: {
      type: Number,
      default: 0,
    },
    reserved: {
      type: Number,
      default: 0,
    },
    reorderLevel: {
      type: Number,
      default: 0,
    },

    batches: [
      {
        batchNo: String,
        expiryDate: Date,
        quantity: Number,
      },
    ],
  },
  { timestamps: true }
);

warehouseStockSchema.index({ warehouse: 1, product: 1, variant: 1 }, { unique: true });

export default model("wareHouseStock", warehouseStockSchema);
