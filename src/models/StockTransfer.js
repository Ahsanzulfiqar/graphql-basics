import mongoose from "mongoose";
const { Schema, model } = mongoose;

const stockTransferSchema = new Schema(
  {
    transferNo: {
      type: String,
      unique: true,
      index: true,
    },

    fromWarehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },

    toWarehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },

    items: [
      {
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
          required: true,
          min: 1,
        },
        batchNo: String,
        expiryDate: Date,
      },
    ],

    status: {
      type: String,
      enum: ["draft", "transferred", "cancelled"],
      default: "draft",
    },

    note: String,

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    confirmedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    confirmedAt: Date,
  },
  { timestamps: true }
);

export default model("stockTransfer", stockTransferSchema);