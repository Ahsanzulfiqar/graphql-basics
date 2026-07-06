import mongoose from "mongoose";
const { Schema, model } = mongoose;

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
      ref: "productVariant",
      required: false,
    },
    variantName: {
      type: String,
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
      required: false,
      min: 0,
    },
    lineTotal: {
      type: Number,
      required: false,
      min: 0,
      default: 0,
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
purchaseNo: {
  type: String,
  unique: true,
  sparse: true,
  index: true,
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
      default: 0,
      min: 0,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalAmount: {
      type: Number,
      default: 0,
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

    payment: {
      status: {
        type: String,
        enum: ["unpaid", "partial", "paid"],
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

    createdBy: {
  type: Schema.Types.ObjectId,
  ref: "user",
},

updatedBy: {
  type: Schema.Types.ObjectId,
  ref: "user",
},

deletedBy: {
  type: Schema.Types.ObjectId,
  ref: "user",
},

statusTimestamps: {
  draftAt: Date,
  confirmedAt: Date,
  receivedAt: Date,
  cancelledAt: Date,
},

statusHistory: [
  {
    status: String,
    at: Date,
    by: { type: Schema.Types.ObjectId, ref: "user" },
    note: String,
  },
],


accounting: {
  purchasePosted: { type: Boolean, default: false },
  purchaseVoucher: { type: Schema.Types.ObjectId, ref: "voucher" },
  paymentPosted: { type: Boolean, default: false },
  paymentVoucher: { type: Schema.Types.ObjectId, ref: "voucher" },
},


  },
  { timestamps: true }
);

purchaseSchema.pre("save", function (next) {
  const totalAmount = Number(this.totalAmount || 0);
  const paidAmount = Number(this.payment?.paidAmount || 0);

  const balanceAmount = Math.max(totalAmount - paidAmount, 0);

  this.payment = {
    ...this.payment,
    paidAmount,
    balanceAmount,
  };

  if (paidAmount > totalAmount) {
  return next(new Error("Paid amount cannot exceed total amount"));
}

  // ✅ Draft purchase has no final amount yet, so keep unpaid
  if (totalAmount <= 0) {
    this.payment.status = "unpaid";
    this.payment.paidAt = undefined;
  } else {
    this.payment.status = balanceAmount <= 0 ? "paid" : "unpaid";

    if (this.payment.status === "paid" && !this.payment.paidAt) {
      this.payment.paidAt = new Date();
    }

    if (this.payment.status === "unpaid") {
      this.payment.paidAt = undefined;
    }
  }

  next();
});

purchaseSchema.index({ warehouse: 1, createdAt: 1, postedToStock: 1, isDeleted: 1 });
purchaseSchema.index({ "payment.status": 1 });
purchaseSchema.index({ "payment.balanceAmount": 1 });

export default model("purchase", purchaseSchema);