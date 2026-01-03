import mongoose from "mongoose";
const { Schema, model } = mongoose;

const warehouseSchema = new mongoose.Schema(
  {
  name: {
      type: String,
       required: true,
       unique:true
    },
    country:{
      type: String,
       required: true,
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
  },
  {
    timestamps: true,
  }
);

export default model("warehouseSchema", warehouseSchema);
