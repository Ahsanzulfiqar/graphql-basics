import mongoose from "mongoose";
const { Schema, model } = mongoose;

/**
 * 🧩 Purchase item
 */
const purchaseItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
    productName: {
      type: String,
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      ref: "productVarient",
      required: false,
    },
    variantName: {
      type: String,
      required: false,
    },
    sku: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    batchNo: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },
  },
  { _id: false }
);

/**
 * 🧾 Purchase schema
 */
const purchaseSchema = new Schema(
  {
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },

    invoiceNo: {
      type: String,
      trim: true,
    },

    warehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },

    purchaseDate: {
      type: Date,
      default: Date.now,
    },

    status: {
      type: String,
      enum: ["draft", "confirmed", "received", "cancelled"],
      default: "draft",
    },

    items: {
      type: [purchaseItemSchema],
      required: true,
    },

    subTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    notes: {
      type: String,
      trim: true,
    },

    postedToStock: {
      type: Boolean,
      default: false,
    },

    // ✅ NEW payment block
    payment: {
      status: {
        type: String,
        enum: ["unpaid", "paid"],
        default: "unpaid",
        index: true,
      },
      paidAmount: {
        type: Number,
        default: 0,
        min: 0,
      },
      balanceAmount: {
        type: Number,
        default: 0,
        min: 0,
        index: true,
      },
      paidAt: {
        type: Date,
      },
    },

    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

/**
 * ✅ Payment defaults and calculations
 */
purchaseSchema.pre("save", function (next) {
  if (!this.payment) {
    this.payment = {
      status: "unpaid",
      paidAmount: 0,
      balanceAmount: this.totalAmount || 0,
    };
  }

  const totalAmount = Number(this.totalAmount || 0);
  const paidAmount = Number(this.payment.paidAmount || 0);

  this.payment.paidAmount = paidAmount;
  this.payment.balanceAmount = Math.max(totalAmount - paidAmount, 0);

  this.payment.status =
    this.payment.balanceAmount <= 0 ? "paid" : "unpaid";

  next();
});

purchaseSchema.index({ warehouse: 1, createdAt: 1, postedToStock: 1, isDeleted: 1 });
purchaseSchema.index({ "payment.status": 1 });
purchaseSchema.index({ "payment.balanceAmount": 1 });

export default model("purchase", purchaseSchema);