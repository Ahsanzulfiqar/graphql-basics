import mongoose from "mongoose";
import { type } from "os";
import { CountryCodes } from "validator/lib/isISO31661Alpha2";

const schema = new mongoose.Schema(
  {
  name: {
      type: String,
       required: true,
       unique:true
    },
    country:{
      type: String,
       required: true,
       unique:true
    },
    city:{
      type:String,
       required: true,
       
    },
      ismain: {
        type: Boolean,
        required: false,
      },
      mainId: {
        type: String,
         required: false
      },
    
    contact: {
      type: String,
      required: true,
    },


    // signature: {
    //   imageUrl: {
    //     type: String,
    //     required: false,
    //   },
    //   uploadDate: {
    //     type: Date,
    //   },
    // },

    // publicKey: {
    //   type: String,
    //   required: false,
    // },
    // logoImageUrl: {
    //   type: String,
    //   required: false,
    // },
    // siteUrl: {
    //   type: String,
    //   required: true,
    // },
    // password: {
    //   type: String,
    //   required: false,
    // },
    // isVerified: {
    //   type: Boolean,
    //   default: false,
    //   required: true,
    // },

    // qrCode: {
    //   type: Buffer,
    //   required: false,
    // },

    // secret: {
    //   ascii: { type: String, trim: true },
    //   hex: { type: String, trim: true },
    //   base32: { type: String, trim: true },
    //   otpauth_url: { type: String, trim: true },
    // },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("warehouse", schema);
