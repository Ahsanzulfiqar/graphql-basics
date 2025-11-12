import mongoose from "mongoose";
const { Schema, model } = mongoose;

/**
 * 🧾 Schema for each product/variant item inside a purchase
 */
// const purchaseItemSchema = new Schema(
//   {
//     // Product reference (main product)
//     product: {
//       type: Schema.Types.ObjectId,
//       ref: "Product",
//       required: true,
//     },

//     // Optional variant reference
//     variant: {
//       type: Schema.Types.ObjectId,
//       ref: "ProductVariant",
//       required: false,
//     },

//     // Quantity purchased
//     quantity: {
//       type: Number,
//       required: true,
//       min: 1,
//     },

//     // Purchase price per unit
//     purchasePrice: {
//       type: Number,
//       required: true,
//       min: 0,
//     },

//     // Line total = quantity × price
//     lineTotal: {
//       type: Number,
//       required: true,
//       min: 0,
//     },

//     // Optional batch info — perfect for herbal / expiry tracking
//     batchNo: {
//       type: String,
//       trim: true,
//     },
//     expiryDate: {
//       type: Date,
//     },
//   },
//   { _id: false }
// );

/**
 * 🧾 Main Purchase Schema
 */
const purchaseSchema = new Schema(
  {
    // Supplier info
    supplierName: {
      type: String,
      required: true,
      trim: true,
    },
  

    // Invoice / Reference No.
    invoiceNo: {
      type: String,
      trim: true,
    },

    // Warehouse where items will be stored
    warehouse: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },

    // Date of purchase
    purchaseDate: {
      type: Date,
      default: Date.now,
    },

    // Purchase status
    status: {
      type: String,
      enum: ["draft", "confirmed", "received", "cancelled"],
      default: "draft",
    },

    // Items list
    items: 
    [{
       product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    // Optional variant reference
    variant: {
      type: Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: false,
    },

    // Quantity purchased
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    // Purchase price per unit
    purchasePrice: {
      type: Number,
      required: true,
      min: 0,
    },

    // Line total = quantity × price
    lineTotal: {
      type: Number,
      required: true,
      min: 0,
    },

    // Optional batch info — perfect for herbal / expiry tracking
    batchNo: {
      type: String,
      trim: true,
    },
    expiryDate: {
      type: Date,
    },
   } ],

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

    // Notes or internal remarks
    notes: {
      type: String,
      trim: true,
    },

    // Whether the purchase has been posted to stock yet
    postedToStock: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

export default model("Purchase", purchaseSchema);
