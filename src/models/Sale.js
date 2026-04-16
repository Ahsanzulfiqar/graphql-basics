import mongoose from "mongoose";
const { Schema, model } = mongoose;

/**
 * ✅ Sale Item (Line)
 */
const saleItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "product",
      required: true,
    },
    variant: {
      type: Schema.Types.ObjectId,
      ref: "productVariant",
      required: false,
    },

    productName: {
      type: String,
      required: true,
      trim: true,
    },
    variantName: {
      type: String,
      trim: true,
    },
    sku: {
      type: String,
      trim: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    salePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // ✅ NEW: cost snapshot for reporting/profit
    costPrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    lineCost: {
      type: Number,
      default: 0,
      min: 0,
    },

    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

/**
 * ✅ Status History (Audit Trail)
 */
const saleStatusHistorySchema = new Schema(
  {
    status: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
    by: { type: Schema.Types.ObjectId, ref: "user" },
    note: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * ✅ Sale Model (Header)
 */
const saleSchema = new Schema(
  {
    seller: {
      type: Schema.Types.ObjectId,
      ref: "seller",
      required: true,
    },
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: "warehouse",
      required: true,
    },

    invoiceNo: { type: String, trim: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    country: { type: String },
    city: { type: String },
    address: { type: String, trim: true },
    deliveryNotes: { type: String, trim: true },
    shippedAt: { type: Date },

    courier: {
      courierId: { type: Schema.Types.ObjectId, ref: "courier" },
      courierName: String,
      charges: {
        baseCharge: { type: Number, default: 0 },
        codCharge: { type: Number, default: 0 },
        returnCharge: { type: Number, default: 0 },
      },
      trackingNo: String,
      trackingUrl: String,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "confirmed",
        "out_for_delivery",
        "delivered",
        "cancelled",
        "returned",
      ],
      default: "draft",
      index: true,
    },

    statusTimestamps: {
      draftAt: { type: Date },
      confirmedAt: { type: Date },
      outForDeliveryAt: { type: Date },
      deliveredAt: { type: Date },
      cancelledAt: { type: Date },
      returnedAt: { type: Date },
    },

    statusHistory: {
      type: [saleStatusHistorySchema],
      default: [],
    },

    items: {
      type: [saleItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "Sale must have at least 1 item",
      },
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

    notes: { type: String, trim: true },

    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date },

    payment: {
      status: {
        type: String,
        enum: ["unpaid", "paid"],
        default: "unpaid",
        index: true,
      },
      mode: {
        type: String,
        enum: ["COD", "ONLINE"],
        default: "COD",
        index: true,
      },
      bankAccount: {
        type: String,
        trim: true,
      },

      // ✅ NEW
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
  },
  { timestamps: true }
);

/**
 * ✅ Auto set draftAt
 */
saleSchema.pre("save", function (next) {
  if (!this.statusTimestamps) this.statusTimestamps = {};

  if (!this.statusTimestamps.draftAt) {
    this.statusTimestamps.draftAt = this.createdAt || new Date();
  }

  next();
});

/**
 * ✅ Payment defaults and calculations
 * Safe version for old and new flow
 */
saleSchema.pre("save", function (next) {
  if (!this.payment) {
    this.payment = {
      status: "unpaid",
      mode: "COD",
      paidAmount: 0,
      balanceAmount: this.totalAmount || 0,
    };
  }

  const totalAmount = Number(this.totalAmount || 0);
  const paidAmount = Number(this.payment.paidAmount || 0);

  this.payment.paidAmount = paidAmount;
  this.payment.balanceAmount = Math.max(totalAmount - paidAmount, 0);

  // Keep old simple flow: only paid/unpaid
  this.payment.status =
    this.payment.balanceAmount <= 0 ? "paid" : "unpaid";

  if (this.payment.status === "paid" && this.payment.mode === "ONLINE") {
    if (!this.payment.bankAccount || !this.payment.bankAccount.trim()) {
      return next(new Error("Bank account is required for ONLINE paid sales"));
    }
  }

  next();
});

/**
 * ✅ Tracking index fix
 */
saleSchema.index(
  { "courier.trackingNo": 1 },
  {
    unique: true,
    partialFilterExpression: { "courier.trackingNo": { $type: "string" } },
  }
);

saleSchema.index({ warehouse: 1, createdAt: 1, status: 1, isDeleted: 1 });
saleSchema.index({ "payment.status": 1 });
saleSchema.index({ "payment.balanceAmount": 1 });

export default model("sale", saleSchema);