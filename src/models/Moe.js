import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    adminEmail: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      required: true,
      //* use validate for inside field validation
      // validate:{
      //   validator: isEmail,
      //   message: 'Please enter valid email',
      //   isAsync: false
      // }
    },
    telephone: {
      type: String,
      required: true,
    },

    contactEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },

    signature: {
      imageUrl: {
        type: String,
        required: false,
      },
      uploadDate: {
        type: Date,
      },
    },

    publicKey: {
      type: String,
      required: false,
    },
    logoImageUrl: {
      type: String,
      required: false,
    },
    siteUrl: {
      type: String,
      required: true,
    },
    password: {
      type: String,
      required: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
      required: true,
    },

    qrCode: {
      type: Buffer,
      required: false,
    },
    secret: {
      ascii: { type: String, trim: true },
      hex: { type: String, trim: true },
      base32: { type: String, trim: true },
      otpauth_url: { type: String, trim: true },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("moe", schema);
