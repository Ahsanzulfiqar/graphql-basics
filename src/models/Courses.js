import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    issuerId: {
      type: String,
      required: true,
    },
    courseTitle: {
      type: String,
      required: true,
    },
    session: {
      type: String,
    },
    creditHours: {
      type: String,
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("courses", schema);
