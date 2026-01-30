// models/sale.model.js
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
    by: { type: Schema.Types.ObjectId, ref: "user" }, // optional (admin/staff who updated)
    note: { type: String, trim: true },
  },
  { _id: false }
);

/**
 * ✅ Sale Model (Header)
 */
const saleSchema = new Schema(
  {
    // Seller / Warehouse
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

    // Invoice + Customer
    invoiceNo: { type: String, trim: true },
    customerName: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    address: { type: String, trim: true },

    // Shipping / Tracking (set at out_for_delivery)
    courierName: { type: String, trim: true },
    trackingNo: { type: String, trim: true },
    trackingUrl: { type: String, trim: true },
    deliveryNotes: { type: String, trim: true },
    shippedAt: { type: Date },

    // Status Workflow
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

    // Status timestamps (fast reporting)
    statusTimestamps: {
      draftAt: { type: Date },
      confirmedAt: { type: Date },
      outForDeliveryAt: { type: Date },
      deliveredAt: { type: Date },
      cancelledAt: { type: Date },
      returnedAt: { type: Date },
    },

    // Timeline / Audit
    statusHistory: {
      type: [saleStatusHistorySchema],
      default: [],
    },

    // Items
    items: {
      type: [saleItemSchema],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "Sale must have at least 1 item",
      },
    },

    // Totals
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

    // Soft delete
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
  paidAt: {
    type: Date,
  },
},


  },
  { timestamps: true }
);

/**
 * ✅ Auto set draftAt (and ensure statusTimestamps exists)
 */
saleSchema.pre("save", function (next) {
  if (!this.statusTimestamps) this.statusTimestamps = {};
  if (!this.statusTimestamps.draftAt) {
    this.statusTimestamps.draftAt = this.createdAt || new Date();
  }
  next();
});
// Payment hook
saleSchema.pre("save", function (next) {
  if (!this.payment) {
    this.payment = { status: "unpaid", mode: "COD" };
  }

  if (this.payment.status === "paid" && this.payment.mode === "ONLINE") {
    if (!this.payment.bankAccount || !this.payment.bankAccount.trim()) {
      return next(
        new Error("Bank account is required for ONLINE paid sales")
      );
    }
  }

  next();
});




saleSchema.index(
  { trackingNo: 1 },
  {
    unique: true,
    partialFilterExpression: { trackingNo: { $type: "string" } },
  }
);

export default model("sale", saleSchema);
